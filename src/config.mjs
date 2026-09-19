import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateGateway } from './policy.mjs';

export async function loadConfig() {
  const home = homedir();
  const configHome = process.env.XDG_CONFIG_HOME || join(home, '.config');
  let options = {};
  try { options = JSON.parse(await readFile(join(configHome, 'ant-voice/config.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const openclaw = JSON.parse(await readFile(options.openclawConfig || join(home, '.openclaw/openclaw.json'), 'utf8'));
  return {
    gatewayUrl: validateGateway(openclaw.gateway?.remote?.url),
    sdk: options.gatewaySdk || join(home, '.local/share/openclaw-node/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js'),
    playwright: options.playwright || join(home, '.local/share/openclaw-node/node_modules/playwright-core/index.mjs'),
    chromium: options.chromium || '/usr/bin/chromium',
    sessionKey: options.sessionKey || 'agent:main:main',
    voice: options.voice || 'cove',
    port: options.port ?? 17864,
    // Optional browser device IDs stay in this private configuration file.
    inputDeviceId: options.inputDeviceId,
    outputDeviceId: options.outputDeviceId,
  };
}
