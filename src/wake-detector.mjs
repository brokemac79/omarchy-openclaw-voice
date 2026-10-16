import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// This process receives only local model/device settings, never a session or
// credentials. Its protocol cannot carry PCM or pre-activation transcripts.
export async function launchWakeDetector(config, { onWake, onFailure, signal, spawnWorker = spawn } = {}) {
  if (config.wake?.enabled !== true) throw new Error('Wake support is disabled.');
  signal?.throwIfAborted();
  const backend = config.wake.backend ?? 'openwakeword';
  if (!['openwakeword', 'sherpa-onnx'].includes(backend)) throw new Error('Unknown local wake backend.');
  const worker = spawnWorker(config.wake.python || config.python, [fileURLToPath(new URL('../native/wake.py', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...Object.fromEntries(
      ['PATH', 'HOME', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'PULSE_SERVER', 'PULSE_COOKIE', 'LANG']
        .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), PYTHONUNBUFFERED: '1' },
  });
  let closed = false, woke = false, failed = false, ready = false, buffer = '', closePromise;
  let resolveReady, rejectReady, lastSeen = Date.now();
  const readiness = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => worker.once('close', resolve));
  function fail() {
    if (closed || failed || woke) return;
    failed = true; rejectReady(new Error('Local wake detector unavailable.'));
    onFailure?.();
  }
  const timer = setInterval(() => { if (Date.now() - lastSeen > 10000) fail(); }, 1000);
  const handle = {
    close() {
      if (closePromise) return closePromise;
      closed = true; clearInterval(timer); rejectReady(new Error('Wake startup cancelled.'));
      worker.stdin.end(); worker.kill('SIGTERM');
      closePromise = (async () => {
        const killer = setTimeout(() => worker.kill('SIGKILL'), 1500);
        try { await exited; } finally { clearTimeout(killer); signal?.removeEventListener('abort', abort); }
      })();
      return closePromise;
    },
  };
  const abort = () => { void handle.close(); };
  signal?.addEventListener('abort', abort, { once: true });
  worker.stdout.setEncoding('utf8');
  worker.stdout.on('data', chunk => {
    if (closed || failed || woke) return;
    buffer += chunk;
    if (buffer.length > 4096) { fail(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        if (Object.keys(message).length !== 1) throw new Error('Invalid detector event.');
        if (message.event === 'ready' && !ready) { ready = true; lastSeen = Date.now(); resolveReady(); }
        else if (message.event === 'heartbeat' && ready) lastSeen = Date.now();
        else if (message.event === 'wake' && ready) {
          woke = true; clearInterval(timer);
          // Let the caller acquire the ready handle before dispatching a wake
          // delivered in the same stdout chunk as readiness.
          setImmediate(() => { if (!closed) onWake?.(); }); return;
        }
        else throw new Error('Invalid detector event.');
      } catch { fail(); return; }
    }
  });
  worker.stderr.resume(); // Never expose library diagnostics/device identifiers.
  worker.on('error', fail); worker.on('exit', fail); worker.stdin.on('error', fail);
  // Explicitly copy the small configuration; do not serialize the gateway config.
  const fields = backend === 'sherpa-onnx' ? ['encoder', 'decoder', 'joiner', 'tokens', 'bpe', 'phrase', 'threshold', 'consecutive']
    : ['model', 'melspec', 'embedding', 'threshold', 'consecutive'];
  worker.stdin.write(JSON.stringify({ backend, ...Object.fromEntries(fields.filter(key => config.wake[key] !== undefined)
    .map(key => [key, config.wake[key]])), inputDevice: config.inputDevice }) + '\n');
  try { await readiness; return handle; }
  catch (error) { await handle.close(); throw error; }
}
