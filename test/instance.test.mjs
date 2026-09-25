import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { resolveInstance } from '../src/instance.mjs';
import { loadConfig } from '../src/config.mjs';

test('Node and QML share the same closed instance mapping', async () => {
  const qml = vm.createContext({});
  vm.runInContext(await readFile(new URL('../Instance.js', import.meta.url), 'utf8'), qml);
  for (const [name, base] of [[undefined, 'openclaw-voice'], ['default', 'openclaw-voice'],
    ['test-a_1', 'openclaw-voice-test-a_1']]) {
    const env = name === undefined ? {} : { OPENCLAW_VOICE_INSTANCE: name };
    const instance = resolveInstance(env);
    assert.equal(instance.basename, base);
    assert.equal(instance.unit, base + '.service');
    assert.equal(qml.basename(name), base);
  }
  for (const name of ['', '..', '../default', 'with space', 'a;true', 'A', 'x\n', 'a'.repeat(33)]) {
    assert.throws(() => resolveInstance({ OPENCLAW_VOICE_INSTANCE: name }), /instance/i);
    assert.equal(qml.basename(name), '');
  }
  assert.equal(qml.controlPath('test', '', '/home/test'), '');
  assert.equal(qml.controlPath('test', 'relative', '/home/test'), '');
  assert.equal(qml.controlPath('test', '/tmp/a b;$(false)', '/home/test'), '/tmp/a b;$(false)');
  assert.equal(qml.controlPath('default', '', '/home/test'), '/home/test/.local/bin/openclaw-voice');
});

test('named options select their own config and SDK over ambient defaults', async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-instance-'));
  try {
    const folder = join(root, 'openclaw-voice-test'); await mkdir(folder);
    const config = join(root, 'candidate.json');
    await writeFile(config, JSON.stringify({ gateway: { mode: 'remote', remote: { url: 'ws://127.0.0.1:29789' } } }));
    await writeFile(join(folder, 'config.json'), JSON.stringify({ openclawConfig: config, gatewaySdk: '/candidate/sdk.js' }));
    const result = await loadConfig({ home: root, env: { XDG_CONFIG_HOME: root,
      OPENCLAW_VOICE_INSTANCE: 'test', OPENCLAW_CONFIG_PATH: '/must-not-read/production.json' } });
    assert.equal(result.gatewayUrl, 'ws://127.0.0.1:29789');
    assert.equal(result.sdk, '/candidate/sdk.js');
    assert.equal(result.instance.basename, 'openclaw-voice-test');
    await assert.rejects(loadConfig({ home: root, env: { OPENCLAW_VOICE_INSTANCE: '../bad' } }), /instance/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
