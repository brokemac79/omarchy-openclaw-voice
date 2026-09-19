import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineOwner } from '../src/engine-owner.mjs';
const tick = () => new Promise(r => setImmediate(r));
function fixture(launch) {
  const states = [], meters = [];
  let closes = 0, now = 0;
  const owner = new EngineOwner({ session: { close: async () => { closes++; } }, launch,
    native: { set: (...s) => states.push(s), levels: (...s) => meters.push(s) }, now: () => now });
  return { owner, states, meters, closes: () => closes, time: t => { now = t; } };
}
test('cancelled startup releases its late engine and never starts capture', async () => {
  let resolve, started = 0, closed = 0;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  const work = f.owner.start(); await tick(); await f.owner.stop();
  resolve({ start: () => { started++; }, close: async () => { closed++; } });
  await work;
  assert.equal(started, 0); assert.equal(closed, 1); assert.equal(f.owner.requested, false);
});
test('mute during launch survives startup and is displayed only after worker acknowledgment', async () => {
  let resolve, options, callbacks;
  const f = fixture(c => { callbacks = c; return new Promise(r => { resolve = r; }); });
  const work = f.owner.start(); await tick(); f.owner.mute();
  resolve({ start: async o => { options = o; }, close: async () => {} }); await work;
  assert.equal(options.muted, true); assert.equal(f.owner.muteConfirmed, false);
  callbacks.onTelemetry({ active: true, muted: true, input: 1, output: 0.5 });
  assert.equal(f.owner.muteConfirmed, true); assert.deepEqual(f.meters.at(-1), [0, 0.5]);
  assert.equal(f.states.at(-1)[1], 'Microphone muted'); await f.owner.stop();
});
test('old engine callbacks cannot stop or overwrite a replacement', async () => {
  const callbacks = [];
  const f = fixture(async c => { callbacks.push(c); return { start: async () => {}, close: async () => {} }; });
  await f.owner.start(); await f.owner.stop(); await f.owner.start();
  callbacks[0].onFailure('old error'); callbacks[0].onTelemetry({ active: true });
  assert.equal(f.owner.requested, true); assert.equal(f.owner.active, false);
  await f.owner.stop();
});
test('heartbeat cannot hide a connection that never finishes', async () => {
  let callbacks, closed = 0;
  const f = fixture(async c => { callbacks = c; return { start: async () => {}, close: async () => { closed++; } }; });
  await f.owner.start(); f.time(46000); callbacks.onTelemetry({ active: false }); f.owner.checkHealth();
  await tick(); assert.equal(closed, 1); assert.equal(f.owner.requested, false);
});
test('worker failure releases local audio without waiting for provider cleanup', async () => {
  let callbacks, closed = 0, finish;
  const f = fixture(async c => { callbacks = c; return { start: async () => {}, close: async () => { closed++; } }; });
  f.owner.session.close = () => new Promise(r => { finish = r; });
  await f.owner.start(); callbacks.onFailure('audio failed'); await tick();
  assert.equal(closed, 1); assert.equal(f.owner.active, false); finish(); await f.owner.cleanup;
});

test('slow gateway acquisition gets its own deadline before media heartbeats begin', async () => {
  let finish;
  const f = fixture(async () => ({ start: () => new Promise(r => { finish = r; }), close: async () => {} }));
  const starting = f.owner.start(); await tick();
  f.time(11000); f.owner.checkHealth(); assert.equal(f.owner.requested, true);
  f.time(44000); finish(); await starting;
  f.time(45000); f.owner.checkHealth(); assert.equal(f.owner.requested, true);
  f.time(55000); f.owner.checkHealth(); await tick(); assert.equal(f.owner.requested, false);
});
