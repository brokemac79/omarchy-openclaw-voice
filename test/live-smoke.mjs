// Explicit integration check. The daemon must itself be in silence-only mode.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
if (process.env.ANT_VOICE_LIVE_TEST !== '1') throw new Error('Set ANT_VOICE_LIVE_TEST=1 to opt in.');
const { origin, key } = JSON.parse(await readFile(join(process.env.XDG_RUNTIME_DIR, 'ant-voice/connection.json')));
const headers = { 'x-ant-voice-key': key };
async function request(path, method = 'GET') {
  const response = await fetch(origin + path, { headers, method });
  assert.ok(response.ok, `HTTP request failed: ${path}`); return response.json();
}
async function until(predicate, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await request('/status');
    if (predicate(state)) return state;
    if (state.status === 'error') throw new Error('Voice entered an error state.');
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Voice did not reach the expected state.');
}
const initial = await request('/status');
assert.equal(initial.syntheticSilence, true, 'Refusing to test with real microphone or speakers.');
assert.equal(initial.requested, false, 'An existing conversation must not be interrupted.');
assert.equal((await fetch(origin + '/status')).status, 403);
assert.equal((await fetch(origin + '/status', { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
let connected = false, mute = false;
try {
  await until(s => s.connected);
  await request('/toggle', 'POST');
  connected = (await until(s => s.active)).active;
  await request('/mute', 'POST');
  mute = (await until(s => s.muted)).muted;
  await request('/stop', 'POST');
  await until(s => !s.requested && !s.active && !s.engineStarting);
  await request('/toggle', 'POST'); await request('/stop', 'POST');
  await until(s => !s.requested && !s.active && !s.engineStarting);
  const final = await request('/status');
  assert.equal(final.status, 'idle');
  console.log(JSON.stringify({ webRTCConnected: connected, mute, stopped: !final.active,
    startupCancellation: 'passed', authenticationChecks: 'passed', audio: 'synthetic silence; playback muted' }));
} finally { await request('/stop', 'POST'); }
