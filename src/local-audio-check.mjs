import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No Gateway, credential or network fields cross this protocol.
export async function launchAudioCheck(config, { mode, device, signal, onEnd, onFailure,
  synthetic = false, spawnWorker = spawn } = {}) {
  signal?.throwIfAborted();
  const args = [fileURLToPath(new URL('../native/audio_check.py', import.meta.url))];
  if (synthetic) args.push('--synthetic');
  const worker = spawnWorker(config.python, args, { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...Object.fromEntries(['PATH', 'HOME', 'XDG_RUNTIME_DIR', 'PULSE_SERVER', 'PULSE_COOKIE', 'LANG']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), PYTHONUNBUFFERED: '1' } });
  let closed = false, failed = false, ready = false, buffer = '', closePromise, resolveReady, rejectReady;
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => worker.once('close', resolve));
  function fail() {
    if (closed || failed) return;
    failed = true; rejectReady(Error('Local check unavailable.')); onFailure?.();
  }
  const handle = { close() {
    if (closePromise) return closePromise;
    closed = true; rejectReady(Error('Local check stopped.'));
    worker.stdin.end(); worker.kill('SIGTERM');
    closePromise = (async () => {
      const killer = setTimeout(() => worker.kill('SIGKILL'), 1500);
      try { await exited; } finally { clearTimeout(killer); signal?.removeEventListener('abort', abort); }
    })();
    return closePromise;
  } };
  const abort = () => { void handle.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', chunk => {
    if (closed || failed) return;
    buffer += chunk;
    if (buffer.length > 4096) { fail(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (message.event === 'ready' && !ready && message.synthetic === synthetic) { ready = true; resolveReady(); }
        else if (message.event === 'complete' && ready) onEnd?.();
        else throw Error('Invalid local audio event');
      } catch { fail(); return; }
    }
  });
  worker.stderr.resume();
  worker.on('error', fail); worker.on('exit', fail); worker.stdin.on('error', fail);
  worker.stdin.write(JSON.stringify({ mode, device }) + '\n');
  const timeout = setTimeout(fail, 4000);
  try { await readiness; return handle; }
  catch (error) { await handle.close(); throw error; }
  finally { clearTimeout(timeout); }
}
