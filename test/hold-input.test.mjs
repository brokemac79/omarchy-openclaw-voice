import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineOwner } from '../src/engine-owner.mjs';
import { HoldInput } from '../src/hold-input.mjs';

const first = 'a'.repeat(16), second = 'b'.repeat(16);
function fixture(releaseBehavior = 'mute') {
  let time = 0, launches = 0, closes = 0, hold;
  const commands = [], states = [], starts = [];
  const owner = new EngineOwner({ now: () => time,
    session: { close: async () => {} }, getHold: () => hold?.snapshot(),
    native: { levels() {}, set: (...args) => states.push(args) },
    launch: async () => { launches++; return { start: async options => starts.push(options),
      holdInput: (...args) => commands.push(args), quiet: value => commands.push(['quiet', value]),
      close: async () => { closes++; } }; },
  });
  hold = new HoldInput({ owner, now: () => time, releaseBehavior });
  const ready = () => {
    owner.talk({ type: 'session.ready' });
    owner.telemetry({ active: true, captureReady: true, muted: true }); hold.tick();
    owner.telemetry({ active: true, captureReady: true, muted: false });
  };
  return { owner, hold, commands, states, starts, ready, time: value => { time = value; },
    launches: () => launches, closes: () => closes };
}

test('hold waits for verified readiness; release preserves playback and subsequent holds reuse one call', async () => {
  const f = fixture(); assert.equal(f.hold.press(first), true); await f.owner.startup;
  assert.equal(f.starts[0].muted, true); assert.equal(f.starts[0].holdMode, true);
  assert.equal(f.commands.length, 0); assert.equal(f.hold.snapshot().ready, false);
  f.owner.telemetry({ active: true, captureReady: true, muted: true }); f.hold.tick();
  assert.equal(f.commands.length, 0); // Talk session-ready is still missing.
  f.ready(); assert.equal(f.hold.snapshot().ready, true);
  assert.deepEqual(f.commands.at(-1), [first, true]);
  f.owner.mute(); assert.equal(f.owner.muted, false); // Generic unmute is disabled in hold mode.
  f.hold.release(first); assert.deepEqual(f.commands.at(-1), [first, false]);
  assert.equal(f.owner.requested, true); assert.equal(f.closes(), 0);
  f.owner.quiet(); assert.deepEqual(f.commands.at(-1), ['quiet', true]);
  assert.equal(f.hold.press(second), true); assert.equal(f.launches(), 1);
  f.hold.release(second); await f.owner.stop();
});

test('release-before-ready cancels acquisition and closes late media without starting it', async () => {
  const f = fixture(); let resolve, started = 0, closed = 0;
  f.owner.launch = () => new Promise(done => { resolve = done; });
  f.hold.press(first); await new Promise(done => setImmediate(done));
  f.hold.release(first);
  resolve({ start: async () => { started++; }, close: async () => { closed++; } });
  await f.owner.startup; assert.equal(started, 0); assert.equal(closed, 1);
  assert.equal(f.owner.requested, false); assert.equal(f.hold.renew(first), false);
});

test('a release delivered before its start and repeated starts never renew an expired hold', async () => {
  const f = fixture(); f.hold.release(first); assert.equal(f.hold.press(first), false);
  assert.equal(f.hold.press(second), true); await f.owner.startup; f.ready();
  f.time(500); f.hold.press(second); f.time(600); f.hold.tick();
  assert.equal(f.hold.snapshot().held, false); assert.equal(f.hold.renew(second), false);
  assert.deepEqual(f.commands.at(-1), [second, false]); await f.owner.stop();
});

test('overlap, missing renewal, maximum hold and disconnect all close the gate without reopening', async () => {
  for (const cause of ['overlap', 'lease', 'watchdog', 'disconnect']) {
    const f = fixture(); f.hold.press(first); await f.owner.startup; f.ready();
    if (cause === 'overlap') assert.equal(f.hold.press(second), false);
    if (cause === 'lease') { f.time(600); f.hold.tick(); }
    if (cause === 'watchdog') {
      for (let time = 200; time < 30000; time += 200) { f.time(time); f.hold.renew(first); }
      f.time(30000); f.hold.renew(first);
    }
    if (cause === 'disconnect') { await f.owner.setGatewayConnected(false); f.hold.tick(); }
    assert.equal(f.hold.snapshot().held, false); assert.equal(f.hold.renew(first), false);
    assert.deepEqual(f.commands.at(-1), [first, false]); await f.owner.stop();
  }
});

test('configured end-on-release closes voice; default release never ends the session', async () => {
  const f = fixture('end'); f.hold.press(first); await f.owner.startup; f.ready();
  f.hold.release(first); await f.owner.mediaCleanup;
  assert.equal(f.owner.requested, false); assert.equal(f.closes(), 1);
  assert.equal(f.hold.snapshot().releaseBehavior, 'end');
  assert.equal(f.hold.press(second), false); // Explicit result review is required after End.
});

test('conversation, wake, result review and unavailable destinations cannot be silently replaced by a hold', async () => {
  for (const blocked of ['conversation', 'wake', 'review', 'unavailable']) {
    const f = fixture();
    if (blocked === 'conversation') await f.owner.start();
    if (blocked === 'wake') f.owner.standby = true;
    if (blocked === 'review') f.owner.reviewRequired = true;
    if (blocked === 'unavailable') f.hold.canStart = () => false;
    assert.equal(f.hold.press(first), false); assert.equal(f.hold.renew(first), false);
    assert.equal(f.hold.snapshot().held, false); await f.owner.stop();
  }
});
