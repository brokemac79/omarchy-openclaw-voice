import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OFFER_PATH } from './policy.mjs';

// Credentials stay in Node; the audio worker only receives SDP and device names.
export async function launchEngine(config, session, { syntheticSilence = false,
  onFailure, onTelemetry, spawnWorker = spawn, exchange = fetch } = {}) {
  const args = [fileURLToPath(new URL('../native/audio.py', import.meta.url))];
  if (syntheticSilence) args.push('--synthetic-silence');
  const worker = spawnWorker(config.python, args, { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  let closed = false, failed = false, ready = false, started = false, offered = false;
  let desiredMute = false, buffer = '', resolveReady, rejectReady, closePromise;
  const aborter = new AbortController();
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => worker.once('close', resolve));
  function fail() {
    if (closed || failed) return;
    failed = true;
    rejectReady(new Error('Native audio engine unavailable.'));
    onFailure?.('Native audio failed. Check microphone, speakers and connection.');
  }
  function send(data) {
    if (!closed && !failed) worker.stdin.write(JSON.stringify(data) + '\n');
  }
  async function offer(sdp) {
    const grant = session.grant;
    if (offered || !started || !grant || typeof sdp !== 'string' || sdp.length > 131072 ||
        !sdp.startsWith('v=0') || !sdp.includes('m=audio') || /m=(video|application)/.test(sdp)) throw new Error('Invalid offer.');
    offered = true;
    const response = await exchange(config.gatewayUrl.replace(/^ws(s?):/, 'http$1:') + OFFER_PATH, {
      method: 'POST', redirect: 'error',
      signal: AbortSignal.any([aborter.signal, AbortSignal.timeout(25000)]),
      headers: { Authorization: `Bearer ${grant.clientSecret}`, 'Content-Type': 'application/sdp' }, body: sdp,
    });
    if (!response.ok) throw new Error('Offer rejected.');
    const answer = await response.text();
    if (answer.length > 131072) throw new Error('Invalid answer.');
    if (!closed && session.grant === grant) send({ command: 'answer', sdp: answer });
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
          ready = true; resolveReady();
        } else if (message.event === 'offer') void offer(message.sdp).catch(fail);
        else if (message.event === 'levels') onTelemetry?.(message);
        else if (message.event === 'error') fail();
      } catch { fail(); }
    }
  });
  // Library diagnostics can contain device names and network addresses.
  worker.stderr.resume();
  worker.on('error', fail); worker.on('exit', fail); worker.stdin.on('error', fail);
  const handle = {
    async start({ muted = false } = {}) {
      desiredMute = muted;
      await session.create();
      if (closed || failed) return;
      started = true;
      send({ command: 'start', muted: desiredMute, inputDevice: config.inputDevice, outputDevice: config.outputDevice });
    },
    mute(value) { desiredMute = value; if (started) send({ command: 'mute', muted: value }); },
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
  const timeout = setTimeout(fail, 10000);
  try { await readiness; return handle; }
  catch (error) { await handle.close(); throw error; }
  finally { clearTimeout(timeout); }
}
