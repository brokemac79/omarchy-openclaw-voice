import test from 'node:test';
import assert from 'node:assert/strict';
import { checkVoiceConfig, checkGrant, validateGateway, level } from '../src/policy.mjs';

const oauth = () => ({ auth: { profiles: { voice: { provider: 'openai', mode: 'oauth' } } } });
test('OAuth is required; reasoning fallbacks are preserved and reported', () => {
  assert.throws(() => checkVoiceConfig({}));
  const config = oauth(); config.agents = { defaults: { model: { fallbacks: ['example/text-model'] } } };
  const before = structuredClone(config);
  assert.deepEqual(checkVoiceConfig(config).fallbackModels, ['example/text-model']);
  assert.deepEqual(config, before);
  config.auth.profiles.api = { provider: 'openai', mode: 'api_key' };
  assert.throws(() => checkVoiceConfig(config));
});
test('visible API credential routes fail closed', () => {
  for (const patch of [
    { talk: { realtime: { apiKey: 'synthetic' } } },
    { talk: { realtime: { providers: { openai: { apiKey: 'synthetic' } } } } },
    { models: { providers: { openai: { apiKey: 'synthetic' } } } },
    { env: { OPENAI_API_KEY: 'synthetic' } }, { env: { vars: { OPENAI_API_KEY: 'synthetic' } } },
  ]) assert.throws(() => checkVoiceConfig({ ...oauth(), ...patch }));
});
test('grant must keep the expected OAuth model, audio transport and gateway ownership', () => {
  const good = { provider: 'openai', transport: 'webrtc', model: 'gpt-live-1-codex',
    clientControl: { owner: 'gateway' }, offerUrl: '/plugins/openai/realtime/calls',
    voiceSessionId: 'synthetic-session', clientSecret: 'synthetic-secret' };
  assert.doesNotThrow(() => checkGrant(good));
  for (const patch of [{ model: 'other' }, { transport: 'websocket' }, { offerUrl: 'https://example.com' },
    { clientControl: { owner: 'client' } }, { clientSecret: '' }]) assert.throws(() => checkGrant({ ...good, ...patch }));
});
test('remote gateway must be a secure origin without embedded credentials', () => {
  assert.equal(validateGateway('wss://example.com/'), 'wss://example.com');
  for (const input of ['ws://example.com', 'wss://user:password@example.com', 'wss://example.com/path', 'wss://example.com/?token=test']) assert.throws(() => validateGateway(input));
});
test('invalid audio levels cannot poison QML state', () => {
  assert.equal(level(NaN), 0); assert.equal(level(Infinity), 0); assert.equal(level('1'), 0);
  assert.equal(level(-1), 0); assert.equal(level(2), 1); assert.equal(level(0.5), 0.5);
});
