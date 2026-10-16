import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineOwner } from '../src/engine-owner.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
  let now = 0, held = 0, maximum = 0, talks = 0;
  const callbacks = [], states = [];
  const acquire = () => { maximum = Math.max(maximum, ++held); let closed = false;
    return { close: async () => { if (!closed) { closed = true; held--; } } }; };
  const owner = new EngineOwner({ now: () => now, singleRequestBoundary: true,
    native: { set: (...s) => states.push(s), levels() {} }, session: { close: async () => {} },
    launchWake: async c => { callbacks.push(c); return acquire(); },
    launch: async c => { callbacks.push(c); talks++; return { ...acquire(),
      start: async () => { owner.talk({ type: 'session.ready' }); }, mute() {} }; },
  });
  return { owner, callbacks, states, time: value => { now = value; }, held: () => held,
    maximum: () => maximum, talks: () => talks };
}
test('off and repeated reconnect-style render never open input; arming is explicit', async () => {
  const f = fixture(); f.owner.render(); f.owner.render(); f.owner.checkHealth();
  assert.equal(f.held(), 0); assert.equal(f.owner.wakeMode, 'off');
  await f.owner.arm('one-request'); assert.equal(f.owner.standby, true);
  assert.match(f.states.at(-1)[1], /local microphone.*one request/);
  assert.equal(f.talks(), 0); assert.throws(() => f.owner.arm('conversation'));
  await f.owner.stop(); assert.equal(f.held(), 0);
});
test('production default rejects an unqualified one-request boundary before opening input', () => {
  const f = fixture(); f.owner.singleRequestBoundary = false;
  assert.throws(() => f.owner.arm('one-request'), /not qualified/);
  assert.equal(f.held(), 0); assert.equal(f.owner.wakeMode, 'off');
});
test('Talk readiness requires both native transport and the current session readiness event', async () => {
  const f = fixture();
  f.owner.launch = async () => ({ start: async () => {}, close: async () => {} });
  await f.owner.start();
  f.owner.telemetry({ active: true });
  assert.equal(f.owner.active, false); assert.equal(f.states.at(-1)[0], 'connecting');
  f.owner.talk({ type: 'output.text.delta', payload: { text: 'Synthetic early event' } });
  assert.equal(f.states.at(-1)[0], 'connecting');
  f.owner.talk({ type: 'session.ready' });
  assert.equal(f.owner.active, true); assert.equal(f.states.at(-1)[0], 'listening');
  await f.owner.stop(); await f.owner.start();
  f.owner.talk({ type: 'session.ready' }); assert.equal(f.owner.active, false);
  f.owner.telemetry({ active: true }); assert.equal(f.owner.active, true); await f.owner.stop();
});
test('duplicate wakes release detector before Talk and late playback wakes cannot reactivate', async () => {
  const f = fixture(); await f.owner.arm('conversation'); const detector = f.callbacks[0];
  detector.onWake(); detector.onWake(); await f.owner.startup;
  assert.equal(f.talks(), 1); assert.equal(f.maximum(), 1);
  assert.equal(f.owner.active, false); assert.equal(f.owner.phase, 'connecting');
  f.time(321); f.owner.telemetry({ active: true, output: 1 });
  assert.equal(f.owner.wakeToReadyMs, 321);
  f.owner.talk({ type: 'output.audio.started' }); detector.onWake();
  assert.equal(f.talks(), 1); assert.equal(f.owner.standby, false);
  await f.owner.stop(); detector.onWake(); detector.onFailure();
  assert.equal(f.held(), 0); assert.equal(f.owner.wakeMode, 'off');
});
test('Stop during detector creation closes its late handle without rearming', async () => {
  const f = fixture(), ready = deferred(); let closed = 0;
  f.owner.launchWake = () => ready.promise;
  const work = f.owner.arm('one-request'); await tick(); const stopped = f.owner.stop();
  assert.equal(f.owner.phase, 'stopping');
  ready.resolve({ close: async () => { closed++; } }); await work; await stopped;
  assert.equal(closed, 1); assert.equal(f.owner.standby, false);
  assert.equal(f.owner.wakeMode, 'off');
});
test('Stop during wake handoff waits for detector release and prevents a late Talk launch', async () => {
  const f = fixture(), release = deferred();
  f.owner.launchWake = async c => { f.callbacks.push(c); return { close: () => release.promise }; };
  await f.owner.arm('one-request'); f.callbacks[0].onWake(); await tick();
  const stopped = f.owner.stop(); release.resolve(); await stopped; await f.owner.startup;
  assert.equal(f.talks(), 0); assert.equal(f.owner.wakeMode, 'off');
});
test('a detector release failure blocks microphone replacement', async () => {
  const f = fixture(); f.owner.launchWake = async c => { f.callbacks.push(c);
    return { close: async () => { throw Error('fixture release'); } }; };
  await f.owner.arm('conversation'); f.callbacks[0].onWake(); await f.owner.startup;
  assert.equal(f.talks(), 0); assert.equal(f.owner.mediaFault, true);
  assert.match(f.states.at(-1)[1], /release unconfirmed/);
  assert.throws(() => f.owner.arm('one-request'));
});
test('detector and Talk setup failures disarm; old failure cannot affect replacement', async () => {
  const f = fixture(); f.owner.launchWake = async () => { throw Error('fixture model'); };
  await f.owner.arm('one-request'); assert.equal(f.owner.wakeMode, 'off');
  assert.equal(f.owner.phase, 'error');
  const g = fixture(); await g.owner.arm('one-request'); const detector = g.callbacks[0];
  g.owner.launch = async () => { throw Error('fixture Talk'); };
  detector.onWake(); await g.owner.startup;
  assert.equal(g.owner.wakeMode, 'off'); assert.equal(g.held(), 0);
  await g.owner.arm('conversation'); detector.onFailure();
  assert.equal(g.owner.standby, true); await g.owner.stop();
});
test('standby mute releases input; a muted input cannot trigger Talk', async () => {
  const f = fixture(); await f.owner.arm('one-request'); f.owner.mute();
  f.callbacks[0].onWake(); await f.owner.cleanup;
  assert.equal(f.talks(), 0); assert.equal(f.held(), 0); assert.equal(f.owner.wakeMode, 'off');
});
test('one request waits for muted input and quiet playback before explicitly rearming', async () => {
  const f = fixture(); await f.owner.arm('one-request'); f.callbacks[0].onWake(); await f.owner.startup;
  f.owner.telemetry({ active: true, output: 1 }); f.time(100);
  f.owner.talk({ type: 'turn.ended' });
  f.time(2000); f.owner.checkHealth(); assert.equal(f.owner.standby, false);
  f.owner.telemetry({ active: true, muted: true, output: 1 });
  f.time(3400); f.owner.checkHealth(); assert.equal(f.owner.standby, false);
  f.owner.telemetry({ active: true, muted: true, output: 0 });
  f.time(3600); f.owner.checkHealth(); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); assert.equal(f.maximum(), 1);
  assert.equal(f.talks(), 1); await f.owner.stop();
});
test('Stop/disconnect while returning to standby cancels the selected mode', async () => {
  const f = fixture(), cleanup = deferred();
  await f.owner.arm('one-request'); f.callbacks[0].onWake(); await f.owner.startup;
  f.owner.session.close = () => cleanup.promise;
  f.owner.telemetry({ active: true, muted: true }); f.owner.talk({ type: 'turn.ended' });
  f.time(1600); f.owner.checkHealth();
  const stop = f.owner.stop('Gateway disconnected. Microphone off.');
  cleanup.resolve(); await stop; await tick();
  assert.equal(f.owner.standby, false); assert.equal(f.owner.wakeMode, 'off');
  assert.equal(f.held(), 0);
});
test('open conversation never returns automatically; manual Talk does not inherit a wake mode', async () => {
  const f = fixture(); await f.owner.arm('conversation'); f.callbacks[0].onWake(); await f.owner.startup;
  f.owner.telemetry({ active: true }); f.owner.talk({ type: 'turn.ended' }); f.time(2000); f.owner.checkHealth();
  assert.equal(f.owner.requested, true); assert.equal(f.owner.standby, false);
  await f.owner.stop(); await f.owner.arm('one-request'); await f.owner.start();
  assert.equal(f.owner.wakeMode, 'off'); assert.equal(f.maximum(), 1); await f.owner.stop();
});
