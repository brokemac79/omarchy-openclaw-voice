import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/state.mjs';

test('runtime state is private, bounds captions, and clears audio and caption on shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openclaw-voice-test-'));
  const state = await createState(directory);
  try {
    state.set('listening', 'Synthetic caption '.repeat(30), { user: 'x'.repeat(4000), assistant: '<b>Plain text</b>' },
      { lastResult: 'r'.repeat(4000), cancelAvailable: true, workStatus: 'completed', token: 'synthetic-secret',
        hold: { mode: true, held: true, token: 'synthetic-secret', remainingMs: 99999, releaseBehavior: 'unknown' },
        audio: { state: 'ready', inputs: [{ id: 'default', label: 'Synthetic microphone', detail: 'fixture-mic', token: 'synthetic-secret' }],
          token: 'synthetic-secret', check: { phase: 'checking', mode: 'speaker', remainingMs: 99999, token: 'synthetic-secret' } },
        actionCards: [{ number: 1, status: 'heard', text: 'synthetic-secret' },
          { number: 2, status: 'completed', exitCode: 0 }, { number: -1, status: 'completed' }],
        earlierUnknown: -1, additionalUnknown: true,
        destination: { id: 'work', label: 'Synthetic context', agent: 'Synthetic agent', target: 'Synthetic node',
          state: 'ready', canSwitch: true, sessionKey: 'synthetic-secret', nodeId: 'synthetic-secret' },
        destinationChoices: [{ id: 'work', label: 'Synthetic context', state: 'ready', token: 'synthetic-secret' }] }); state.levels(0.2, 2);
    await new Promise(r => setTimeout(r, 180));
    assert.equal(JSON.parse(await readFile(join(directory, 'state.json'))).text.length, 240);
    assert.equal(state.get().user.length, 1800);
    assert.equal(state.get().assistant, '<b>Plain text</b>');
    assert.equal(state.get().lastResult.length, 1800);
    assert.equal(state.get().workStatus, 'unknown'); assert.equal(state.get().cancelAvailable, false);
    assert.deepEqual(state.get().actionCards, [{ number: 1, status: 'heard' }, { number: 2, status: 'unknown' }]);
    assert.equal(state.get().earlierUnknown, 0); assert.equal(state.get().additionalUnknown, true);
    assert.equal(state.get().destination.label, 'Synthetic context');
    assert.equal(state.get().destination.canSwitch, true);
    assert.equal(state.get().audio.inputs[0].label, 'Synthetic microphone');
    assert.deepEqual(state.get().audio.check, { phase: 'checking', mode: 'speaker', remainingMs: 2000 });
    assert.equal(state.get().hold.remainingMs, 30000); assert.equal(state.get().hold.releaseBehavior, 'mute');
    assert.ok(!JSON.stringify(state.get()).includes('synthetic-secret'));
    assert.equal(await readFile(join(directory, 'level'), 'utf8'), '0.2 1');
    if (process.platform !== 'win32') {
      assert.equal((await stat(directory)).mode & 0o777, 0o700);
      assert.equal((await stat(join(directory, 'state.json'))).mode & 0o777, 0o600);
    }
    await state.close();
    assert.equal(JSON.parse(await readFile(join(directory, 'state.json'))).status, 'idle');
    assert.equal(state.get().user, ''); assert.equal(state.get().assistant, '');
    assert.equal(state.get().lastResult, undefined);
    assert.equal(await readFile(join(directory, 'level'), 'utf8'), '0 0');
  } finally { await state.close(); await rm(directory, { recursive: true, force: true }); }
});
