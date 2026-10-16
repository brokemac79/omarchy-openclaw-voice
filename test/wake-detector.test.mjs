import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { launchWakeDetector } from '../src/wake-detector.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill() { setImmediate(() => child.emit('close', 0)); } });
  let options, settings = '', woke = 0, failures = 0;
  child.stdin.on('data', bytes => { settings += bytes; });
  const start = signal => launchWakeDetector({ python: '/fake/python', gatewayAuth: { token: 'synthetic-secret' },
    gatewayUrl: 'https://invalid.example', inputDevice: 'synthetic-device',
    wake: { enabled: true, model: '/fake/phrase.onnx', melspec: '/fake/mel.onnx', embedding: '/fake/embedding.onnx' } },
  { signal, spawnWorker: (_exe, _args, opts) => { options = opts; return child; },
    onWake: () => { woke++; }, onFailure: () => { failures++; } });
  return { child, start, options: () => options, settings: () => settings,
    woke: () => woke, failures: () => failures };
}
test('detector receives only local settings and a credential-free environment', async () => {
  const f = fixture(); const work = f.start();
  f.child.stdout.write('{"event":"ready"}\n'); const handle = await work;
  assert.deepEqual(Object.keys(JSON.parse(f.settings())).sort(), ['embedding', 'inputDevice', 'melspec', 'model']);
  assert.ok(!f.settings().includes('secret')); assert.ok(!f.settings().includes('gateway'));
  assert.ok(!('OPENCLAW_GATEWAY_TOKEN' in f.options().env));
  f.child.stdout.write('{"event":"heartbeat"}\n');
  await handle.close(); assert.equal(f.woke(), 0);
});
test('ready and duplicate wake in one chunk deliver once after acquisition', async () => {
  const f = fixture(); const work = f.start();
  f.child.stdout.write('{"event":"ready"}\n{"event":"wake"}\n{"event":"wake"}\n');
  const handle = await work; await tick(); assert.equal(f.woke(), 1);
  f.child.emit('exit', 0); assert.equal(f.failures(), 0);
  await handle.close();
});
test('stop between detector event and queued wake suppresses activation', async () => {
  const f = fixture(); const work = f.start();
  f.child.stdout.write('{"event":"ready"}\n{"event":"wake"}\n');
  const handle = await work; await handle.close(); await tick(); assert.equal(f.woke(), 0);
});
test('malformed, oversized and pre-ready wake events fail closed', async () => {
  for (const message of ['{"event":"wake"}\n', 'x'.repeat(4097), '{"event":"ready","audio":"forbidden"}\n', 'invalid\n']) {
    const f = fixture(); const work = f.start(); f.child.stdout.write(message);
    await assert.rejects(work); assert.equal(f.failures(), 1); assert.equal(f.woke(), 0);
  }
});
test('unexpected worker exit after readiness reports failure and closes cleanly', async () => {
  const f = fixture(); const work = f.start(); f.child.stdout.write('{"event":"ready"}\n');
  const handle = await work; f.child.emit('exit', 1); assert.equal(f.failures(), 1); await handle.close();
});
test('abort cancels pending readiness and releases the worker without a failure or wake', async () => {
  const f = fixture(), aborter = new AbortController();
  const work = f.start(aborter.signal); aborter.abort();
  await assert.rejects(work, /cancelled/);
  f.child.stdout.write('{"event":"ready"}\n{"event":"wake"}\n'); await tick();
  assert.equal(f.failures(), 0); assert.equal(f.woke(), 0);
});
