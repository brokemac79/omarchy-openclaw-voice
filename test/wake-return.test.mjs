import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineOwner } from '../src/engine-owner.mjs';
import { standbyPhrase, WakeReturn } from '../src/wake-return.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(options = {}) {
  let now = 0, held = 0, maximum = 0, seq = 0;
  const callbacks = [], states = [];
  const acquire = () => {
    maximum = Math.max(maximum, ++held); let closed = false;
    return { close: async () => { if (!closed) { closed = true; held--; } } };
  };
  const owner = new EngineOwner({ now: () => now,
    native: { set: (...state) => states.push(state), levels() {} }, session: { close: async () => {} },
    launchWake: async callback => { callbacks.push(callback); return acquire(); },
    launch: async callback => { callbacks.push(callback); return { ...acquire(),
      start: async () => owner.talk({ type: 'session.ready' }), mute() {} }; }, ...options });
  const telemetry = (data = {}) => owner.telemetry({ active: true, captureReady: true, input: 0, output: 0, ...data });
  const at = (value, data) => { now = value; telemetry(data); owner.checkHealth(); };
  const event = (type, text, turnId = 'synthetic-turn') => owner.talk({ type, seq: ++seq, turnId, payload: { text, role: 'user' } });
  const wake = async () => { await owner.arm('conversation'); callbacks[0].onWake(); await owner.startup; telemetry(); };
  return { owner, states, callbacks, event, at, wake, telemetry, held: () => held, maximum: () => maximum };
}

test('standalone standby commands accept common polite/ASR forms, never quotes, negation or unrelated requests', () => {
  for (const phrase of ['return to standby', 'Go back to standby.', 'switch to stand by', 'Back to stand-by!',
    'Please return to standby mode.', 'OpenClaw, go back to standby, please.',
    'Hey Open Claw, could you please return to standby?', 'Okay, return to wake word listening.']) {
    assert.equal(standbyPhrase(phrase), true, phrase);
  }
  for (const phrase of ['Do not return to standby', 'How do I return to standby?', 'Say return to standby',
    '"return to standby"', 'return to standby after sending an email', 'stop listening', '', null,
    'x'.repeat(300) + ' return to standby']) assert.equal(standbyPhrase(phrase), false, String(phrase));
});

test('final user command ends Talk before local standby and retains the received answer', async () => {
  const f = fixture(); await f.wake();
  f.event('output.text.done', 'Synthetic useful answer.');
  f.event('transcript.done', 'Go back to standby.', 'standby-command');
  await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); assert.equal(f.owner.requested, false);
  assert.equal(f.owner.lastResult, 'Synthetic useful answer.');
  assert.equal(f.owner.answer.text, 'Synthetic useful answer.');
  assert.equal(f.maximum(), 1); assert.equal(f.held(), 1);
  assert.equal(f.owner.reviewRequired, true);
  assert.equal(f.owner.actions.snapshot().actionCards.length, 0);
  await f.owner.stop(); assert.equal(f.held(), 0);
});

test('partial transcripts, assistant speech, tool text and quoted or negated commands do not end voice', async () => {
  const f = fixture(); await f.wake();
  f.event('transcript.delta', 'return to standby');
  f.event('transcript.done', 'Do not return to standby');
  f.event('output.text.done', 'Return to standby');
  f.event('tool.result', 'return to standby');
  f.owner.talk({ type: 'transcript.done', seq: 100, turnId: 'other', payload: { role: 'assistant', text: 'Return to standby' } });
  assert.equal(f.owner.requested, true); assert.equal(f.owner.standby, false);
  await f.owner.stop();
});

test('older transcripts cannot command a return, and late events from the ended call cannot restart audio', async () => {
  const f = fixture(); await f.wake();
  f.event('transcript.done', 'Synthetic ordinary request');
  f.owner.talk({ type: 'transcript.done', seq: 1, turnId: 'synthetic-turn', payload: { text: 'Return to standby' } });
  assert.equal(f.owner.requested, true);
  f.event('transcript.done', 'Return to standby'); await tick(); await f.owner.startup;
  f.event('transcript.done', 'Return to standby');
  f.callbacks[1].onTelemetry({ active: true, captureReady: true });
  f.callbacks[1].onFailure(Error('Synthetic old worker'));
  assert.equal(f.owner.standby, true); assert.equal(f.owner.requested, false);
  await f.owner.stop();
});

test('default 30 seconds counts idle time, not heartbeats; a new wake starts another ordinary conversation', async () => {
  const f = fixture(); await f.wake();
  f.at(29999); assert.equal(f.owner.requested, true);
  f.at(30000); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); assert.equal(f.maximum(), 1);
  f.callbacks.at(-1).onWake(); await f.owner.startup; f.telemetry();
  assert.equal(f.owner.active, true); assert.equal(f.owner.standby, false);
  await f.owner.stop();
});

test('pending replies, streaming output and native playback tails prevent an idle return', async () => {
  const f = fixture(); await f.wake();
  f.event('transcript.done', 'Synthetic long question');
  f.at(60000); assert.equal(f.owner.requested, true);
  f.event('output.text.delta', 'Synthetic answer');
  f.event('output.audio.started');
  f.at(120000); assert.equal(f.owner.requested, true);
  f.event('output.text.done', 'Synthetic answer complete');
  f.event('output.audio.done'); f.event('turn.ended');
  f.at(140000, { output: 0.4 });
  f.at(169999); assert.equal(f.owner.requested, true);
  f.at(170000); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); assert.equal(f.owner.lastResult, 'Synthetic answer complete');
  await f.owner.stop();
});

test('follow-up microphone activity and new user turns restart the countdown', async () => {
  const f = fixture(); await f.wake();
  f.at(29000, { input: 0.2 }); f.at(58000); assert.equal(f.owner.requested, true);
  f.event('transcript.done', 'Synthetic follow-up', 'second');
  f.at(90000); assert.equal(f.owner.requested, true);
  f.event('turn.ended', undefined, 'second'); f.at(119999); assert.equal(f.owner.requested, true);
  f.at(120000); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); await f.owner.stop();
});

test('an old turn ending cannot release a newer pending reply; delayed finals after completion do not hang idle', async () => {
  const f = fixture(); await f.wake();
  f.event('transcript.done', 'First', 'first'); f.event('transcript.done', 'Second', 'second');
  f.event('turn.ended', undefined, 'first'); f.at(60000); assert.equal(f.owner.requested, true);
  f.event('turn.ended', undefined, 'second'); f.event('transcript.done', 'Second', 'second');
  f.at(90000); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); await f.owner.stop();
});

test('configured duration and 0=disabled work; voice commands remain available when idle return is disabled', async () => {
  for (const seconds of [60, 0]) {
    const f = fixture({ wakeInactivitySeconds: seconds }); await f.wake();
    f.at(30000); assert.equal(f.owner.requested, true);
    if (seconds) { f.at(60000); } else { f.at(3600000); f.event('transcript.done', 'Return to standby'); }
    await tick(); await f.owner.startup; assert.equal(f.owner.standby, true); await f.owner.stop();
  }
});

test('ordinary click/hold calls have no idle return; voice return needs a configured detector and excludes hold', async () => {
  for (const options of [{}, { hold: true }]) {
    const f = fixture(); await f.owner.start(options); f.telemetry(); f.at(60000);
    assert.equal(f.owner.requested, true);
    f.event('transcript.done', 'Return to standby'); await tick(); await f.owner.startup;
    assert.equal(f.owner.standby, !options.hold); await f.owner.stop();
  }
  const f = fixture({ launchWake: undefined }); await f.owner.start(); f.telemetry();
  f.event('transcript.done', 'Return to standby'); await tick(); assert.equal(f.owner.requested, true);
  await f.owner.stop();
});

test('explicit input mute suppresses automatic microphone rearming', async () => {
  const f = fixture(); await f.wake(); f.owner.mute();
  f.at(60000, { muted: true }); await tick();
  assert.equal(f.owner.requested, true); assert.equal(f.owner.standby, false);
  f.owner.mute(); f.at(89999, { muted: false }); assert.equal(f.owner.requested, true);
  f.at(90000); await tick(); await f.owner.startup; assert.equal(f.owner.standby, true);
  await f.owner.stop();
});

test('early response events before native readiness still block idle expiry', async () => {
  const f = fixture(); await f.owner.arm('conversation');
  f.callbacks[0].onWake(); await f.owner.startup;
  f.event('output.audio.started');
  f.telemetry(); f.at(60000); assert.equal(f.owner.requested, true);
  f.event('turn.ended'); f.at(90000); await tick(); await f.owner.startup;
  assert.equal(f.owner.standby, true); await f.owner.stop();
});

test('Stop, disconnect, shutdown guards and replacement calls cancel an in-flight return', async () => {
  for (const cancel of ['stop', 'disconnect', 'guard', 'replacement']) {
    let allowed = true;
    const f = fixture({ canReturnToWake: () => allowed }), cleanup = deferred(); await f.wake();
    f.owner.session.close = () => cleanup.promise;
    const returning = f.owner.returnToStandby(); await tick();
    let next;
    if (cancel === 'stop') next = f.owner.stop();
    if (cancel === 'disconnect') await f.owner.setGatewayConnected(false);
    if (cancel === 'guard') allowed = false;
    if (cancel === 'replacement') next = f.owner.start();
    cleanup.resolve(); await returning; await next; await f.owner.startup;
    assert.equal(f.owner.standby, false, cancel); assert.ok(f.maximum() <= 1);
    await f.owner.stop();
  }
});

test('release failure, startup failure and stale heartbeat leave Off instead of opening standby', async () => {
  for (const failure of ['release', 'startup', 'heartbeat']) {
    const f = fixture(); await f.wake();
    if (failure === 'release') f.owner.engine.close = async () => { throw Error('Synthetic release failure'); };
    if (failure === 'startup') f.owner.launchWake = async () => { throw Error('Synthetic missing detector'); };
    if (failure === 'heartbeat') { f.at(0); f.owner.now = () => 40000; f.owner.checkHealth(); }
    else await f.owner.returnToStandby();
    await tick(); assert.equal(f.owner.standby, false); assert.equal(f.owner.requested, false);
    await f.owner.stop();
  }
});

test('missing correlation or overflowing the bounded ledger disables idle return, never explicit voice return', async () => {
  for (const bad of ['missing', 'overflow']) {
    const f = fixture(); await f.wake();
    if (bad === 'missing') f.owner.talk({ type: 'output.audio.started' });
    else for (let index = 0; index < 129; index++) f.event('turn.ended', undefined, String(index));
    f.at(60000); assert.equal(f.owner.requested, true);
    assert.match(f.states.at(-1)[1], /idle return paused/);
    f.event('transcript.done', 'Return to standby', 'command'); await tick(); await f.owner.startup;
    assert.equal(f.owner.standby, true); await f.owner.stop();
  }
});

test('unrelated events and repeated terminals do not keep an idle conversation open', () => {
  let now = 0;
  const policy = new WakeReturn({ now: () => now }); policy.ready();
  policy.accept({ type: 'turn.ended', seq: 2, turnId: 'a' });
  now = 29000;
  policy.accept({ type: 'health.changed', seq: 3 });
  policy.accept({ type: 'turn.ended', seq: 2, turnId: 'a' });
  now = 30000; assert.equal(policy.due(), true);
});
