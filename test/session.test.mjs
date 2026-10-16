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
  await waitCreate(f.calls); const closing = f.session.close(); f.finish();
  await assert.rejects(pending, /cancelled/);
  await closing;
  assert.equal(f.session.grant, null);
  assert.equal(f.calls.filter(c => c.method === 'talk.client.close').length, 1);
});

test('Stop waits for an in-flight reservation to be released before a restart', async () => {
  const f = fixture(); const pending = f.session.create(); await waitCreate(f.calls);
  let closed = false; const closing = f.session.close().then(() => { closed = true; });
  await new Promise(r => setImmediate(r)); assert.equal(closed, false);
  f.finish(); await assert.rejects(pending, /cancelled/); await closing;
  assert.equal(f.session.creating, false);
  const restarted = f.session.create(); await new Promise(r => setImmediate(r)); f.finish();
  await restarted; await f.session.close();
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

test('reservation and late cleanup stay bound to the original destination even if another key is configured', async () => {
  for (const cancel of [false, true]) {
    const f = fixture(); const pending = f.session.create(); await waitCreate(f.calls);
    f.session.sessionKey = 'agent:another:main';
    const closing = cancel ? f.session.close() : null;
    f.finish();
    if (cancel) await assert.rejects(pending, /cancelled/); else await pending;
    await (closing || f.session.close());
    assert.equal(f.calls.find(call => call.method === 'talk.client.create').params.sessionKey, 'agent:example:main');
    assert.equal(f.calls.find(call => call.method === 'talk.client.close').params.sessionKey, 'agent:example:main');
  }
});

test('an unavailable destination refuses provider reservation before voice configuration or audio startup', async () => {
  const calls = [];
  const session = new VoiceSession(async method => { calls.push(method); }, 'agent:example:main', 'cove',
    async () => { throw new Error('Synthetic unavailable destination'); });
  await assert.rejects(session.create(), /unavailable destination/);
  assert.deepEqual(calls, []); assert.equal(session.grant, null);
  await session.close();
});
