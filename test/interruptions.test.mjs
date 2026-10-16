import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineOwner } from '../src/engine-owner.mjs';

function fixture() {
  const media = [], states = [], levels = [];
  let releases = 0, callsClosed = 0;
  const owner = new EngineOwner({
    session: { close: async () => { callsClosed++; } },
    native: { set: (...args) => states.push(args), levels: (...args) => levels.push(args) },
    launch: async () => ({ start: async () => {},
      quiet: value => media.push(['output', value]), mute: value => media.push(['input', value]),
      close: async () => { releases++; } }),
  });
  return { owner, media, states, levels, releases: () => releases, callsClosed: () => callsClosed };
}

test('Quiet silences output only after acknowledgment and keeps input, call and text alive', async () => {
  const f = fixture(); await f.owner.start();
  f.owner.talk({ type: 'session.ready' });
  f.owner.telemetry({ active: true, captureReady: true, input: 0.6, output: 0.5 });
  f.owner.talk({ type: 'output.text.delta', seq: 1, payload: { text: 'Text survives ' } });
  f.owner.quiet(); f.owner.quiet();
  assert.equal(f.owner.controls().speechQuiet, false);
  assert.equal(f.owner.controls().speechQuietRequested, true);
  assert.deepEqual(f.media, [['output', true], ['output', true]]);
  assert.equal(f.releases(), 0); assert.equal(f.callsClosed(), 0);
  f.owner.telemetry({ active: true, captureReady: true, outputMuted: true, input: 0.6, output: 0.5 });
  assert.deepEqual(f.levels.at(-1), [0.6, 0]);
  assert.equal(f.owner.controls().speechQuiet, true);
  assert.equal(f.owner.controls().inputMuted, false);
  f.owner.talk({ type: 'output.text.done', seq: 2, payload: { text: 'Text survives Quiet.' } });
  assert.equal(f.states.at(-1)[2].assistant, 'Text survives Quiet.');
  f.owner.mute(); f.owner.quiet(false);
  assert.deepEqual(f.media.slice(-2), [['input', true], ['output', false]]);
  assert.equal(f.owner.requested, true);
  await f.owner.stop();
});

test('Quiet and input mute selected during acquisition reach the same new call independently', async () => {
  const f = fixture(); let finish, options;
  f.owner.launch = () => new Promise(resolve => { finish = resolve; });
  const starting = f.owner.start();
  await new Promise(resolve => setImmediate(resolve));
  f.owner.quiet(); f.owner.mute();
  finish({ start: async value => { options = value; }, close: async () => {} });
  await starting;
  assert.deepEqual(options, { muted: true, outputMuted: true });
  await f.owner.stop();
});

test('End voice or delivery failure preserves the last received final text without claiming work completion', async () => {
  for (const failure of [undefined, 'Audio delivery failed']) {
    const f = fixture(); await f.owner.start();
    f.owner.talk({ type: 'output.text.done', seq: 5, payload: { text: 'Received fallback text.' } });
    f.owner.talk({ type: 'turn.ended', seq: 6, payload: { status: 'completed' } });
    assert.equal(f.owner.controls().workStatus, 'unknown');
    await f.owner.stop(failure);
    assert.equal(f.releases(), 1); assert.equal(f.owner.requested, false);
    assert.equal(f.owner.controls().lastResult, 'Received fallback text.');
    f.owner.talk({ type: 'output.text.done', seq: 7, payload: { text: 'Late old-call text.' } });
    assert.equal(f.owner.controls().lastResult, 'Received fallback text.');
    assert.equal(f.owner.controls().workStatus, 'unknown');
    await f.owner.start();
    assert.equal(f.owner.controls().lastResult, '');
    assert.equal(f.owner.controls().speechQuietRequested, false);
    await f.owner.stop();
  }
});

test('uncorrelated cancellation never stops media, aborts another request or invents success across completion races', async () => {
  const f = fixture(); await f.owner.start();
  for (const type of ['tool.call', 'turn.ended', 'turn.cancelled', 'tool.result']) {
    f.owner.talk({ type, turnId: 'provider-turn', payload: { status: 'completed' } });
    assert.deepEqual(f.owner.cancelRequest(), { outcome: 'unavailable', reason: 'exact_request_control_unavailable' });
    assert.equal(f.owner.controls().workStatus, 'unknown');
    assert.equal(f.owner.requested, true);
    assert.equal(f.releases(), 0); assert.equal(f.callsClosed(), 0);
  }
  await f.owner.stop();
  assert.equal(f.owner.cancelRequest().outcome, 'unavailable');
  f.owner.dismissResult();
  assert.equal(f.owner.controls().lastResult, '');
  assert.equal(f.owner.controls().workStatus, 'unknown');
});
