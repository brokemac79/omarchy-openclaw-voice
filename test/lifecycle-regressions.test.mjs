import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineOwner } from '../src/engine-owner.mjs';
import { HoldInput } from '../src/hold-input.mjs';
import { createState } from '../src/state.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('a cancelled late engine with failed release blocks replacement audio and reports unconfirmed release', async () => {
  let acquired, launches = 0, captureStarts = 0;
  const owner = new EngineOwner({ session: { close: async () => {} }, native: { levels() {}, set() {} },
    launch: () => {
      launches++;
      if (launches === 1) return new Promise(resolve => { acquired = resolve; });
      return { start: async () => { captureStarts++; }, close: async () => {} };
    },
  });
  const first = owner.start(); await tick(); await owner.stop();
  const replacement = owner.start();
  acquired({ start: async () => { captureStarts++; }, close: async () => { throw Error('Synthetic release failure'); } });
  await Promise.all([first, replacement]);
  try {
    assert.equal(launches, 1, 'Unconfirmed old media must block a replacement worker.');
    assert.equal(captureStarts, 0);
    assert.equal(owner.mediaFault, true);
    assert.equal(owner.requested, false);
    assert.equal(owner.failure.code, 'release_unconfirmed');
  } finally { await owner.stop(); }
});

test('a failed late release remains visibly unconfirmed even without a replacement call', async () => {
  let acquired;
  const states = [];
  const owner = new EngineOwner({ session: { close: async () => {} }, native: { levels() {}, set: (...args) => states.push(args) },
    launch: () => new Promise(resolve => { acquired = resolve; }),
  });
  const first = owner.start(); await tick(); await owner.stop();
  acquired({ start: async () => assert.fail('Cancelled capture started'), close: async () => { throw Error('Synthetic release failure'); } });
  await first;
  assert.equal(owner.mediaFault, true);
  assert.equal(states.at(-1)[0], 'error');
  assert.equal(states.at(-1)[3].errorCode, 'release_unconfirmed');
});

test('releasing a hold retains visible reply captions while input stays muted and playback continues', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-held-reply-'));
  const native = await createState(directory);
  let hold;
  const owner = new EngineOwner({ native, session: { close: async () => {} }, getHold: () => hold?.snapshot(),
    launch: async () => ({ start: async () => {}, close: async () => {}, holdInput() {} }),
  });
  hold = new HoldInput({ owner });
  try {
    const token = 'a'.repeat(16); hold.press(token); await owner.startup;
    owner.talk({ type: 'session.ready' });
    owner.telemetry({ active: true, captureReady: true, muted: true }); hold.tick();
    owner.telemetry({ active: true, captureReady: true, muted: false });
    hold.release(token);
    owner.telemetry({ active: true, captureReady: true, muted: true, output: 0.5 });
    owner.talk({ type: 'output.text.done', seq: 1, payload: { text: 'Synthetic reply after release.' } });
    assert.equal(native.get().status, 'input-muted');
    assert.equal(native.get().assistant, 'Synthetic reply after release.');
    assert.equal(native.get().answer.text, native.get().assistant);
    assert.equal(native.get().speechQuiet, false);
    await owner.stop();
    assert.equal(native.get().assistant, '');
  } finally { await owner.stop(); await native.close(); await rm(directory, { recursive: true, force: true }); }
});
