import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { launchEngine } from '../src/native-engine.mjs';
const tick = () => new Promise(r => setImmediate(r));
function fixture() {
  const child = new EventEmitter(), commands = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(data, _, cb) { commands.push(JSON.parse(data)); cb(); } });
  child.kill = () => { queueMicrotask(() => child.emit('close', 0)); };
  let args;
  const spawnWorker = (_, a) => { args = a; queueMicrotask(() => child.stdout.write('{"event":"ready","syntheticSilence":true}\n')); return child; };
  const session = { grant: { clientSecret: 'synthetic', voiceSessionId: 'test' }, create: async () => {} };
  const config = { python: 'synthetic-python', gatewayUrl: 'wss://example.com' };
  return { child, commands, session, config, spawnWorker, args: () => args };
}
test('synthetic mode is explicit and startup mute cannot be lost while reserving a session', async () => {
  const f = fixture(); let finish;
  f.session.create = () => new Promise(r => { finish = r; });
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true });
  const starting = engine.start(); engine.mute(true); finish(); await starting;
  assert.ok(f.args().includes('--synthetic-silence'));
  assert.equal(f.commands[0].muted, true);
  assert.equal(f.commands[0].command, 'start'); await engine.close();
});
test('stop during grant acquisition never starts the native pipeline', async () => {
  const f = fixture(); let finish;
  f.session.create = () => new Promise(r => { finish = r; });
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true });
  const starting = engine.start(); await engine.close(); finish(); await starting;
  assert.equal(f.commands.length, 0);
});
test('late SDP response after stop cannot reach a replacement worker', async () => {
  const f = fixture(); let finish, signal;
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true,
    exchange: async (_, options) => { signal = options.signal; return new Promise(r => { finish = r; }); } });
  await engine.start(); f.child.stdout.write(JSON.stringify({ event: 'offer', sdp: 'v=0\r\nm=audio test' }) + '\n');
  await tick(); await engine.close(); assert.equal(signal.aborted, true);
  finish({ ok: true, text: async () => 'v=0 synthetic answer' }); await tick();
  assert.equal(f.commands.filter(c => c.command === 'answer').length, 0);
});
test('unexpected worker exit reports failure once; shutdown does not report another', async () => {
  const f = fixture(); let failed = 0;
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true, onFailure: () => failed++ });
  f.child.emit('exit', 1); f.child.emit('error', new Error('synthetic'));
  assert.equal(failed, 1); await engine.close(); assert.equal(failed, 1);
});
test('spawn failure closes promptly instead of waiting for a nonexistent exit event', async () => {
  const f = fixture();
  const spawnWorker = () => { queueMicrotask(() => { f.child.emit('error', new Error('ENOENT')); f.child.emit('close', -1); }); return f.child; };
  await assert.rejects(launchEngine(f.config, f.session, { spawnWorker }));
});
