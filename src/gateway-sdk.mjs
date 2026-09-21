import { realpath, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadGatewaySdk(entrypoint) {
  const path = await realpath(entrypoint);
  const sdk = await import(pathToFileURL(path).href);
  if (typeof sdk.GatewayClient !== 'function' || typeof sdk.startGatewayClientWhenEventLoopReady !== 'function') {
    throw new Error('Gateway SDK exports unavailable.');
  }
  let build = null;
  try {
    const info = JSON.parse(await readFile(resolve(dirname(path), '../build-info.json'), 'utf8'));
    const safe = value => typeof value === 'string' && value.length <= 256 ? value : null;
    build = { version: safe(info.version), commit: safe(info.commit), buildId: safe(info.buildId) };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { sdk, binding: { path, build } };
}
