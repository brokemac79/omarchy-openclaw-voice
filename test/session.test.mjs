import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession } from '../src/session.mjs';

function fixture() {
  let resolve;
  const grant = { provider: 'openai', transport: 'webrtc', model: 'gpt-live-1-codex',
    clientControl: { owner: 'gateway' }, offerUrl: '/plugins/openai/realtime/calls',
    voiceSessionId: 'test-session', clientSecret: 'test-secret' };
  const calls = [];
  const session = new VoiceSession(async (method, params) => {
    calls.push({ method, params });
    if (method === 'config.get') return { config: { auth: { profiles: { test: { provider: 'openai', mode: 'oauth' } } } } };
    if (method === 'talk.catalog') return { realtime: { ready: true } };
    if (method === 'talk.client.create') return new Promise(r => { resolve = r; });
  }, 'agent:example:main');
  return { session, calls, grant, finish: () => resolve(grant) };
}
async function waitCreate(calls) {
  for (let i = 0; i < 20 && !calls.some(c => c.method === 'talk.client.create'); i++) await new Promise(r => setImmediate(r));
  assert.ok(calls.some(c => c.method === 'talk.client.create'));
}
test('Stop during provider startup closes the late grant and never activates it', async () => {
  const f = fixture(); const pending = f.session.create();
  await waitCreate(f.calls); await f.session.close(); f.finish();
  await assert.rejects(pending, /cancelled/);
  assert.equal(f.session.grant, null);
  assert.equal(f.calls.filter(c => c.method === 'talk.client.close').length, 1);
});
test('duplicate startup is rejected and invalid grants are closed', async () => {
  const f = fixture(); const pending = f.session.create(); await waitCreate(f.calls);
  await assert.rejects(f.session.create(), /already/);
  f.grant.model = 'other'; f.finish(); await assert.rejects(pending, /expected/);
  assert.equal(f.calls.filter(c => c.method === 'talk.client.close').length, 1);
  assert.equal(f.session.grant, null);
});
test('normal Stop closes only the selected session and is idempotent', async () => {
  const f = fixture(); const pending = f.session.create(); await waitCreate(f.calls);
  f.finish(); await pending; await f.session.close(); await f.session.close();
  const closes = f.calls.filter(c => c.method === 'talk.client.close');
  assert.deepEqual(closes, [{ method: 'talk.client.close', params: { sessionKey: 'agent:example:main', voiceSessionId: 'test-session' } }]);
});
