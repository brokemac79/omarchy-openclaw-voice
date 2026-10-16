import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OFFER_PATH } from './policy.mjs';
import { VoiceError } from './voice-errors.mjs';

// Bound the accumulated UTF-8 SDP bytes, including chunked/unknown-length bodies.
// Fetch may deliver a larger transport chunk; reject it before copying/decoding.
export const MAX_SDP_BYTES = 131072;
export async function readSdpAnswer(response, signal) {
  if (!response.body) throw new Error('Missing answer.');
  const reader = response.body.getReader();
  const bytes = new Uint8Array(MAX_SDP_BYTES);
  let length = 0, complete = false;
  const abort = () => {
    // Cancelling a reader settles its pending read even if the source stalls.
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) { complete = true; break; }
      if (value.byteLength > MAX_SDP_BYTES - length) throw new Error('SDP answer exceeds 131072 bytes.');
      bytes.set(value, length);
      length += value.byteLength;
    }
    return new TextDecoder().decode(bytes.subarray(0, length));
  } finally {
    signal.removeEventListener('abort', abort);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Credentials stay in Node; the audio worker only receives SDP and device names.
export async function launchEngine(config, session, { syntheticSilence = false,
  onFailure, onTelemetry, onProgress, spawnWorker = spawn, exchange = fetch } = {}) {
  const args = [fileURLToPath(new URL('../native/audio.py', import.meta.url))];
  if (syntheticSilence) args.push('--synthetic-silence');
  const worker = spawnWorker(config.python, args, { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  let closed = false, failed = false, ready = false, started = false, offered = false, answered = false;
  let desiredMute = false, desiredQuiet = false, buffer = '', resolveReady, rejectReady, closePromise;
  const aborter = new AbortController();
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => worker.once('close', resolve));
  function fail(error) {
    if (closed || failed) return;
    failed = true;
    aborter.abort();
    const failure = error instanceof VoiceError ? error : new VoiceError(
      error?.name === 'TimeoutError' && offered && !answered ? 'offer_timeout'
        : answered ? 'audio_transport_failed' : offered ? 'offer_failed' : ready ? 'audio_setup_failed' : 'native_unavailable');
    rejectReady(failure);
    onFailure?.(failure);
  }
  function send(data) {
    if (!closed && !failed) worker.stdin.write(JSON.stringify(data) + '\n');
  }
  async function offer(sdp) {
    const grant = session.grant;
    if (offered || !started || !grant || typeof sdp !== 'string' || sdp.length > 131072 ||
        !sdp.startsWith('v=0') || !sdp.includes('m=audio') || /m=(video|application)/.test(sdp)) throw new Error('Invalid offer.');
    offered = true;
    onProgress?.('offer-started');
    const signal = AbortSignal.any([aborter.signal, AbortSignal.timeout(25000)]);
    const response = await exchange(config.gatewayUrl.replace(/^ws(s?):/, 'http$1:') + OFFER_PATH, {
      method: 'POST', redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${grant.clientSecret}`, 'Content-Type': 'application/sdp' }, body: sdp,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error('Offer rejected.');
    }
    const answer = await readSdpAnswer(response, signal);
    if (!closed && session.grant === grant) {
      answered = true; onProgress?.('offer-answered'); send({ command: 'answer', sdp: answer });
    }
  }
  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', chunk => {
    if (closed || failed) return;
    buffer += chunk;
    if (buffer.length > 262144) { fail(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (message.event === 'ready' && !ready && message.syntheticSilence === syntheticSilence) {
          ready = true; onProgress?.('native-worker-ready'); resolveReady();
        } else if (message.event === 'offer') void offer(message.sdp).catch(fail);
        else if (message.event === 'levels') onTelemetry?.(message);
        else if (message.event === 'error') fail(new VoiceError(
          ['connection-failed', 'connection-disconnected', 'connection-closed'].includes(message.code)
            ? 'audio_transport_failed' : 'audio_setup_failed'));
      } catch { fail(); }
    }
  });
  // Library diagnostics can contain device names and network addresses.
  worker.stderr.resume();
  worker.on('error', fail); worker.on('exit', fail); worker.stdin.on('error', fail);
  const handle = {
    async start({ muted = false, outputMuted = false } = {}) {
      desiredMute = muted;
      desiredQuiet = outputMuted;
      await session.create(onProgress);
      if (closed || failed) return;
      started = true;
      send({ command: 'start', muted: desiredMute, outputMuted: desiredQuiet, inputDevice: config.inputDevice, outputDevice: config.outputDevice });
      onProgress?.('audio-requested');
    },
    mute(value) { desiredMute = value; if (started) send({ command: 'mute', muted: value }); },
    quiet(value) { desiredQuiet = value; if (started) send({ command: 'quiet', outputMuted: value }); },
    close() {
      if (closePromise) return closePromise;
      closed = true; aborter.abort();
      rejectReady(new Error('Audio startup cancelled.'));
      worker.stdin.end(); worker.kill('SIGTERM');
      closePromise = (async () => {
        const killer = setTimeout(() => worker.kill('SIGKILL'), 1500);
        try { await exited; } finally { clearTimeout(killer); }
      })();
      return closePromise;
    },
  };
  const timeout = setTimeout(() => fail(new VoiceError('audio_setup_timeout')), 10000);
  try { await readiness; return handle; }
  catch (error) { await handle.close(); throw error; }
  finally { clearTimeout(timeout); }
}
