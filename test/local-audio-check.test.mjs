import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { launchAudioCheck } from '../src/local-audio-check.mjs';

function fixture() {
  const child = new EventEmitter();
  Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill() { setImmediate(() => child.emit('close', 0)); } });
  let options, settings = '', failures = 0, ended = 0;
  child.stdin.on('data', bytes => { settings += bytes; });
  return { child, settings: () => settings, options: () => options, failures: () => failures, ended: () => ended,
    start: signal => launchAudioCheck({ python: '/fake/python', gatewayAuth: { token: 'synthetic-secret' } },
      { signal, mode: 'speaker', device: 'fixture-speaker', synthetic: true,
        onFailure: () => { failures++; }, onEnd: () => { ended++; },
        spawnWorker: (_exe, _args, opts) => { options = opts; return child; } }) };
}

test('local tone worker receives only speaker selection and no Gateway credentials', async () => {
  const f = fixture(), pending = f.start(); f.child.stdout.write('{"event":"ready","synthetic":true}\n');
  const handle = await pending;
  assert.deepEqual(JSON.parse(f.settings()), { mode: 'speaker', device: 'fixture-speaker' });
  assert.ok(!('OPENCLAW_GATEWAY_TOKEN' in f.options().env));
  assert.ok(!JSON.stringify(f.options()).includes('synthetic-secret'));
  f.child.stdout.write('{"event":"complete"}\n'); assert.equal(f.ended(), 1);
  await handle.close(); assert.equal(f.failures(), 0);
});

test('abort cancels pending tone readiness and ignores late events', async () => {
  const f = fixture(), abort = new AbortController(), pending = f.start(abort.signal);
  abort.abort(); await assert.rejects(pending, /stopped/);
  f.child.stdout.write('{"event":"ready","synthetic":true}\n{"event":"complete"}\n');
  assert.equal(f.ended(), 0); assert.equal(f.failures(), 0);
});

test('malformed or mismatched worker events fail without exposing native diagnostics', async () => {
  for (const message of ['not json', '{"event":"ready","synthetic":false}', 'x'.repeat(4097)]) {
    const f = fixture(), pending = f.start(); f.child.stdout.write(message + '\n');
    await assert.rejects(pending, /unavailable/); assert.equal(f.failures(), 1);
  }
});
