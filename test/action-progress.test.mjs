import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionProgress } from '../src/action-progress.mjs';
import { EngineOwner } from '../src/engine-owner.mjs';

const heard = (seq, turnId = 'synthetic-turn') => ({ type: 'transcript.done', seq, turnId,
  payload: { role: 'user', text: 'Synthetic request.' } });
const response = (type, seq, turnId = 'synthetic-turn') => ({ type, seq, turnId,
  payload: { text: 'Synthetic acknowledgment.', status: 'completed', exitCode: 0 } });

test('a correlated final transcript confirms Heard only; speech and provider completion never prove an action', () => {
  for (const type of ['output.text.done', 'output.audio.started', 'turn.ended', 'turn.cancelled',
    'tool.call', 'tool.progress', 'tool.result', 'tool.error']) {
    const progress = new ActionProgress(); progress.accept(heard(1));
    assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'heard' }]);
    progress.accept(response(type, 2));
    assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'unknown' }]);
  }
});

test('late transcription after an acknowledgment or cancelled response stays unknown', () => {
  for (const type of ['output.text.done', 'turn.cancelled', 'tool.result']) {
    const progress = new ActionProgress(); progress.accept(response(type, 1));
    progress.accept(heard(2)); progress.accept(heard(3));
    assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'unknown' }]);
  }
});

test('missing, mismatched, duplicated and stale correlation cannot create a claimed action result', () => {
  const progress = new ActionProgress();
  for (const event of [heard(undefined), heard(1, ''), heard(1, 'x'.repeat(257)),
    { ...heard(1), payload: { role: 'assistant', text: 'Synthetic reply.' } }]) progress.accept(event);
  assert.deepEqual(progress.snapshot().actionCards, []);
  progress.accept(heard(2)); progress.accept(heard(2)); progress.accept(heard(1, 'old-turn'));
  progress.accept(response('tool.result', 3, 'another-turn'));
  assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'heard' }]);
  progress.accept(response('turn.ended', 4)); progress.accept(heard(5));
  assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'unknown' }]);
});

test('bounded cards retain an earlier-unknown count and stop tracking rather than reassigning old turns', () => {
  const progress = new ActionProgress();
  for (let i = 1; i <= 40; i++) progress.accept(heard(i, `synthetic-${i}`));
  const state = progress.snapshot();
  assert.equal(state.actionCards.length, 4); assert.equal(state.earlierUnknown, 28);
  assert.equal(state.additionalUnknown, true);
  progress.accept(heard(41, 'synthetic-1'));
  assert.deepEqual(progress.snapshot(), state);
  assert.equal(progress.turns.size, 32);
  progress.end(); assert.ok(progress.snapshot().actionCards.every(card => card.status === 'unknown'));
  assert.ok(!/Synthetic request|synthetic-|exitCode|text/.test(JSON.stringify(progress.snapshot())));
  state.actionCards[0].status = 'completed';
  assert.equal(progress.snapshot().actionCards[0].status, 'unknown');
});

test('dismissing visible cards preserves deduplication and allows a fresh turn', () => {
  const progress = new ActionProgress(); progress.accept(heard(1)); progress.dismiss();
  progress.accept(heard(2)); progress.accept(response('turn.ended', 3));
  assert.deepEqual(progress.snapshot().actionCards, []);
  progress.accept(heard(4, 'next-turn'));
  assert.deepEqual(progress.snapshot().actionCards, [{ number: 2, status: 'heard' }]);
  progress.clear(); progress.accept(heard(1));
  assert.deepEqual(progress.snapshot().actionCards, [{ number: 1, status: 'heard' }]);
});

test('Quiet, stop, failure and a fresh call keep observations separate from received text and media ownership', async () => {
  for (const failure of [undefined, 'Synthetic audio failure']) {
    let launches = 0, closes = 0;
    const owner = new EngineOwner({ session: { close: async () => {} },
      native: { set() {}, levels() {} },
      launch: async () => { launches++; return { start: async () => {}, quiet() {}, close: async () => { closes++; } }; } });
    await owner.start(); owner.talk(heard(1)); owner.quiet();
    owner.talk(response('output.text.done', 2));
    assert.equal(owner.controls().lastResult, 'Synthetic acknowledgment.');
    await owner.stop(failure);
    assert.equal(owner.controls().lastResult, 'Synthetic acknowledgment.');
    assert.equal(owner.controls().actionCards[0].status, 'unknown');
    owner.talk(heard(3, 'late-old-turn'));
    assert.equal(owner.controls().actionCards.length, 1);
    assert.equal(launches, 1); assert.equal(closes, 1);
    await owner.setGatewayConnected(true);
    assert.equal(launches, 1);
    await owner.start();
    assert.deepEqual(owner.controls().actionCards, []);
    assert.equal(owner.controls().lastResult, '');
    owner.talk(heard(1, 'fresh-turn')); owner.dismissResult();
    assert.deepEqual(owner.controls().actionCards, []);
    await owner.stop();
  }
});
