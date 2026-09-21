import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewaySdk } from '../src/gateway-sdk.mjs';

test('SDK binding reflects the actual imported module and never falls back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-sdk-'));
  try {
    const dir = join(root, 'dist/plugin-sdk'); await mkdir(dir, { recursive: true });
    const sdk = join(dir, 'gateway-runtime.mjs');
    await writeFile(sdk, 'export class GatewayClient {}\nexport function startGatewayClientWhenEventLoopReady() {}');
    await writeFile(join(root, 'dist/build-info.json'), JSON.stringify({ version: 'test', commit: 'abc', buildId: 'build', token: 'synthetic-secret' }));
    const loaded = await loadGatewaySdk(sdk);
    assert.equal(typeof loaded.sdk.GatewayClient, 'function');
    assert.deepEqual(loaded.binding.build, { version: 'test', commit: 'abc', buildId: 'build' });
    assert.ok(!JSON.stringify(loaded.binding).includes('synthetic-secret'));
    const wrong = join(dir, 'wrong.mjs'); await writeFile(wrong, 'export const unrelated = true;');
    await assert.rejects(loadGatewaySdk(wrong), /exports unavailable/);
    await assert.rejects(loadGatewaySdk(join(dir, 'absent.mjs')), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
