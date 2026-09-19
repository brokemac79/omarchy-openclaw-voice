// Explicit integration check. The daemon must itself be in silence-only mode.
import assert from 'node:assert/strict';
import net from 'node:net';
import { join } from 'node:path';
if (process.env.OPENCLAW_VOICE_LIVE_TEST !== '1') throw new Error('Set OPENCLAW_VOICE_LIVE_TEST=1 to opt in.');
async function request(command) {
  return new Promise((resolve, reject) => {
    const client = net.connect(join(process.env.XDG_RUNTIME_DIR, 'openclaw-voice/control.sock'));
    let buffer = '';
    client.on('connect', () => client.write(JSON.stringify({ command: command.replace('/', '') }) + '\n'));
    client.setTimeout(35000, () => { client.destroy(); reject(new Error('Control timeout')); });
    client.on('error', reject);
    client.on('data', data => { buffer += data; });
    client.on('end', () => {
      try { const result = JSON.parse(buffer); assert.equal(result.ok, true); resolve(result); }
      catch (error) { reject(error); }
    });
  });
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
    startupCancellation: 'passed', engine: 'gstreamer', audio: 'synthetic silence; fake playback sink' }));
} finally { await request('/stop', 'POST'); }
