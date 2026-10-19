import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, resolveGateway } from '../src/config.mjs';

test('wake inactivity defaults to 30 seconds, accepts 0/custom values and rejects malformed durations privately', async () => {
  const home = await mkdtemp(join(tmpdir(), 'voice-wake-config-'));
  try {
    await mkdir(join(home, '.openclaw'));
    await mkdir(join(home, '.config/openclaw-voice'), { recursive: true });
    await writeFile(join(home, '.openclaw/openclaw.json'), '{}');
    const path = join(home, '.config/openclaw-voice/config.json');
    for (const value of [undefined, 0, 1, 60, 3600]) {
      await writeFile(path, JSON.stringify({ wake: { enabled: true, inactivitySeconds: value } }));
      assert.equal((await loadConfig({ home, env: {} })).wake.inactivitySeconds, value ?? 30);
    }
    for (const value of [-1, 3601, 1.5, '30', null, true, 'SYNTH_PRIVATE_VALUE']) {
      await writeFile(path, JSON.stringify({ wake: { inactivitySeconds: value } }));
      await assert.rejects(loadConfig({ home, env: {} }), error => {
        assert.match(error.message, /wake.inactivitySeconds/); assert.doesNotMatch(error.message, /SYNTH/); return true;
      });
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('invalid private configuration fails without quoting its contents or silently accepting a non-object root', async () => {
  const home = await mkdtemp(join(tmpdir(), 'voice-private-config-'));
  try {
    await mkdir(join(home, '.openclaw'));
    await mkdir(join(home, '.config/openclaw-voice'), { recursive: true });
    for (const [gateway, options] of [['SYNTH_PRIVATE_CONFIG', '{}'], ['{}', 'SYNTH_PRIVATE_OPTIONS'],
      ['null', '{}'], ['{}', '[]']]) {
      await writeFile(join(home, '.openclaw/openclaw.json'), gateway);
      await writeFile(join(home, '.config/openclaw-voice/config.json'), options);
      await assert.rejects(loadConfig({ home, env: {} }), error => {
        assert.match(error.message, /configuration/i);
        assert.doesNotMatch(String(error) + JSON.stringify(error), /SYNTH/);
        return true;
      });
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('local installs use loopback and local credentials, ignoring stale remote settings', () => {
  assert.equal(resolveGateway({}, {}).gatewayUrl, 'ws://127.0.0.1:18789');
  const result = resolveGateway({ gateway: { mode: 'local', port: 19001,
    auth: { mode: 'token', token: 'synthetic-local' },
    remote: { url: 'wss://example.com', token: 'synthetic-remote' } } }, {});
  assert.equal(result.gatewayUrl, 'ws://127.0.0.1:19001');
  assert.deepEqual(result.gatewayAuth, { token: 'synthetic-local' });
});

test('remote and legacy remote configs never borrow local gateway credentials', () => {
  for (const mode of ['remote', undefined]) {
    const result = resolveGateway({ gateway: { mode,
      auth: { token: 'synthetic-local' }, remote: { url: 'wss://example.com' } } },
    { OPENCLAW_GATEWAY_TOKEN: 'synthetic-local-env' });
    assert.equal(result.gatewayUrl, 'wss://example.com');
    assert.deepEqual(result.gatewayAuth, { token: undefined, password: undefined });
  }
  assert.throws(() => resolveGateway({ gateway: { mode: 'remote' } }, {}), /remote.url/);
});

test('local password mode ignores unrelated token credentials and resolves environment references', () => {
  const config = { gateway: { mode: 'local', auth: {
    mode: 'password', password: '${VOICE_TEST_PASSWORD}', token: { source: 'unsupported' },
  } } };
  assert.deepEqual(resolveGateway(config, { VOICE_TEST_PASSWORD: 'synthetic-password' }).gatewayAuth,
    { password: 'synthetic-password' });
  assert.throws(() => resolveGateway(config, {}), /Missing environment credential/);
  config.gateway.auth.password = { source: 'env', provider: 'default', id: 'VOICE_TEST_PASSWORD' };
  assert.deepEqual(resolveGateway(config, { VOICE_TEST_PASSWORD: 'synthetic-password' }).gatewayAuth,
    { password: 'synthetic-password' });
  config.gateway.auth.password = { source: 'exec', id: 'unused' };
  assert.throws(() => resolveGateway(config, {}), /Unsupported secret reference/);
});

test('custom local ports and gateway auth environment are supported without disabling authentication', () => {
  const result = resolveGateway({ gateway: { port: 19001 } },
    { OPENCLAW_GATEWAY_PORT: '19002', OPENCLAW_GATEWAY_TOKEN: 'synthetic-env' });
  assert.equal(result.gatewayUrl, 'ws://127.0.0.1:19002');
  assert.equal(result.gatewayAuth.token, 'synthetic-env');
  for (const port of [0, -1, 65536, 1.5, 'bad']) assert.throws(() => resolveGateway({ gateway: { port } }, {}), /port/);
  assert.throws(() => resolveGateway({ gateway: { auth: { mode: 'none' } } }, {}), /authentication/);
});

test('blank local credentials use environment fallback but unresolved references do not', () => {
  for (const mode of ['token', 'password']) {
    const env = { [`OPENCLAW_GATEWAY_${mode.toUpperCase()}`]: 'synthetic-env' };
    for (const value of ['', '  ']) {
      assert.equal(resolveGateway({ gateway: { auth: { mode, [mode]: value } } }, env).gatewayAuth[mode], 'synthetic-env');
    }
    assert.throws(() => resolveGateway({ gateway: { auth: { mode, [mode]: '${MISSING_VOICE_TEST_SECRET}' } } }, env), /Missing environment/);
  }
});

test('environment SecretRefs enforce provider source and allowlist before reading a credential', () => {
  const config = { gateway: { mode: 'local', auth: { mode: 'token',
    token: { source: 'env', provider: 'voice', id: 'VOICE_TEST_TOKEN' } } },
  secrets: { providers: { voice: { source: 'env', allowlist: ['VOICE_TEST_TOKEN'] } } } };
  const env = { VOICE_TEST_TOKEN: 'synthetic-env' };
  assert.equal(resolveGateway(config, env).gatewayAuth.token, 'synthetic-env');
  for (const provider of [{ source: 'env', allowlist: [] }, { source: 'file' }, undefined]) {
    config.secrets.providers.voice = provider;
    assert.throws(() => resolveGateway(config, env), /provider does not allow/);
  }
  config.gateway.auth.token.provider = 'default';
  config.secrets.providers.default = { source: 'env', allowlist: [] };
  assert.throws(() => resolveGateway(config, env), /provider does not allow/);
  delete config.secrets.providers.default;
  config.secrets.defaults = { env: 'voice-default' };
  assert.throws(() => resolveGateway(config, env), /provider does not allow/);
  config.gateway.auth.token.provider = 'voice-default';
  assert.equal(resolveGateway(config, env).gatewayAuth.token, 'synthetic-env');
});

test('isolated OpenClaw state and explicit config paths are read without modifying them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-config-'));
  try {
    const configHome = join(directory, 'config');
    const state = join(directory, 'openclaw-state');
    await mkdir(state); await mkdir(join(configHome, 'openclaw-voice'), { recursive: true });
    await writeFile(join(state, 'openclaw.json'), JSON.stringify({ gateway: { mode: 'local', port: 19003 } }));
    const env = { XDG_CONFIG_HOME: configHome, OPENCLAW_STATE_DIR: state };
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19003');
    const explicit = join(directory, 'explicit.json');
    await writeFile(explicit, JSON.stringify({ gateway: { mode: 'local', port: 19004 } }));
    env.OPENCLAW_CONFIG_PATH = explicit;
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19004');
    env.OPENCLAW_CONFIG_PATH = '~/explicit.json';
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19004');
    delete env.OPENCLAW_CONFIG_PATH;
    env.OPENCLAW_STATE_DIR = '~/openclaw-state';
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19003');
    delete env.OPENCLAW_STATE_DIR;
    env.OPENCLAW_HOME = '~/profile';
    await mkdir(join(directory, 'profile/.openclaw'), { recursive: true });
    await writeFile(join(directory, 'profile/.openclaw/openclaw.json'), JSON.stringify({ gateway: { port: 19005 } }));
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19005');
    await writeFile(join(configHome, 'openclaw-voice/config.json'), JSON.stringify({ openclawConfig: join(state, 'openclaw.json') }));
    assert.equal((await loadConfig({ home: directory, env })).gatewayUrl, 'ws://127.0.0.1:19003');
    assert.equal((await loadConfig({ home: directory, env })).holdRelease, 'mute');
    for (const holdRelease of ['mute', 'end', 'invalid']) {
      await writeFile(join(configHome, 'openclaw-voice/config.json'), JSON.stringify({ openclawConfig: join(state, 'openclaw.json'), holdRelease }));
      if (holdRelease === 'invalid') await assert.rejects(loadConfig({ home: directory, env }), /holdRelease/);
      else assert.equal((await loadConfig({ home: directory, env })).holdRelease, holdRelease);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
