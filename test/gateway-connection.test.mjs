import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionStatus } from '../src/gateway-connection.mjs';

test('hello projection excludes credentials and clears across disconnect/reconnect', () => {
  const state = createConnectionStatus(() => 123);
  const hello = { auth: { method: 'device-token', role: 'operator', scopes: ['operator.read'],
    deviceToken: 'synthetic-secret', deviceTokens: [{ token: 'synthetic-secret' }] },
    server: { version: 'test', buildId: 'test-build', bootId: 'boot', connId: 'first' },
    snapshot: { secret: 'synthetic-secret' } };
  state.accept(hello);
  const first = state.get();
  assert.deepEqual(first, { authMethod: 'device-token', role: 'operator', scopes: ['operator.read'],
    serverVersion: 'test', serverBuildId: 'test-build', bootId: 'boot', connId: 'first', observedAtMs: 123 });
  assert.ok(!JSON.stringify(first).includes('synthetic-secret'));
  hello.auth.scopes.push('operator.admin');
  first.scopes.push('operator.write');
  assert.deepEqual(state.get().scopes, ['operator.read']);
  state.clear(); assert.equal(state.get(), null);
  state.accept({ auth: { method: 'token' }, server: { connId: 'second' } });
  assert.equal(state.get().authMethod, 'token');
  assert.equal(state.get().connId, 'second');
  assert.equal(state.get().serverBuildId, null);
  state.clear(); state.accept({}); assert.equal(state.get().authMethod, null);
});
