import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/state.mjs';

test('runtime state is private, bounds captions, and clears audio and caption on shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ant-voice-test-'));
  const state = await createState(directory);
  try {
    state.set('listening', 'Synthetic caption '.repeat(30)); state.levels(0.2, 2);
    await new Promise(r => setTimeout(r, 180));
    assert.equal(JSON.parse(await readFile(join(directory, 'state.json'))).text.length, 240);
    assert.equal(await readFile(join(directory, 'level'), 'utf8'), '0.2 1');
    if (process.platform !== 'win32') {
      assert.equal((await stat(directory)).mode & 0o777, 0o700);
      assert.equal((await stat(join(directory, 'state.json'))).mode & 0o777, 0o600);
    }
    await state.close();
    assert.equal(JSON.parse(await readFile(join(directory, 'state.json'))).status, 'idle');
    assert.equal(await readFile(join(directory, 'level'), 'utf8'), '0 0');
  } finally { await state.close(); await rm(directory, { recursive: true, force: true }); }
});
