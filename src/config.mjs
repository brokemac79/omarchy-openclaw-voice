import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateGateway } from './policy.mjs';
import { resolveInstance } from './instance.mjs';

function credential(value, env, field, secrets) {
  if (value === undefined || value === null || value === '') return undefined;
  // Resolve only environment references here; never execute secret providers.
  if (typeof value === 'object' && value.source === 'env' && typeof value.id === 'string') {
    const provider = secrets?.providers?.[value.provider] ??
      (value.provider === (secrets?.defaults?.env || 'default') ? { source: 'env' } : undefined);
    if (!provider || provider.source !== 'env' ||
        (provider.allowlist !== undefined && (!Array.isArray(provider.allowlist) || !provider.allowlist.includes(value.id)))) {
      throw new Error(`Environment secret provider does not allow ${field}.`);
    }
    const resolved = env[value.id]?.trim();
    if (resolved) return resolved;
    throw new Error(`Missing environment credential for ${field}.`);
  }
  if (typeof value !== 'string') throw new Error(`Unsupported secret reference for ${field}; use an environment reference.`);
  const reference = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (reference) {
    const resolved = env[reference[1]]?.trim();
    if (resolved) return resolved;
    throw new Error(`Missing environment credential for ${field}.`);
  }
  if (value.includes('${')) throw new Error(`Unsupported environment expression for ${field}.`);
  return value.trim() || undefined;
}

export function resolveGateway(openclaw, env = process.env) {
  const gateway = openclaw.gateway ?? {};
  const secret = (value, field) => credential(value, env, field, openclaw.secrets);
  if (gateway.mode && !['local', 'remote'].includes(gateway.mode)) throw new Error('Unknown OpenClaw gateway mode.');
  // Preserve older remote configs with no mode; an explicit local mode wins
  // over any remote address left behind by an earlier configuration.
  const remote = gateway.mode === 'remote' || (!gateway.mode && Boolean(gateway.remote?.url));
  if (remote) {
    if (!gateway.remote?.url) throw new Error('Remote mode requires gateway.remote.url.');
    return { gatewayUrl: validateGateway(gateway.remote.url), gatewayAuth: {
      token: secret(gateway.remote.token, 'gateway.remote.token'),
      password: secret(gateway.remote.password, 'gateway.remote.password'),
    } };
  }
  const port = Number(env.OPENCLAW_GATEWAY_PORT || (gateway.port ?? 18789));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local gateway port.');
  const auth = gateway.auth ?? {};
  if (auth.mode && !['token', 'password'].includes(auth.mode)) {
    throw new Error('Local voice requires OpenClaw token or password authentication.');
  }
  const gatewayAuth = {};
  if (auth.mode !== 'password') gatewayAuth.token = secret(auth.token, 'gateway.auth.token') ?? secret(env.OPENCLAW_GATEWAY_TOKEN, 'OPENCLAW_GATEWAY_TOKEN');
  if (auth.mode !== 'token') gatewayAuth.password = secret(auth.password, 'gateway.auth.password') ?? secret(env.OPENCLAW_GATEWAY_PASSWORD, 'OPENCLAW_GATEWAY_PASSWORD');
  return { gatewayUrl: validateGateway(`${gateway.tls?.enabled ? 'wss' : 'ws'}://127.0.0.1:${port}`), gatewayAuth };
}

export async function loadConfig({ home = homedir(), env = process.env } = {}) {
  const instance = resolveInstance(env);
  const configHome = env.XDG_CONFIG_HOME || join(home, '.config');
  let options = {};
  try { options = JSON.parse(await readFile(join(configHome, instance.basename, 'config.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const userPath = (value, baseHome) => value?.trim() ? resolve(value.trim().replace(/^~(?=$|[\\/])/, () => baseHome)) : undefined;
  const openclawHome = userPath(env.OPENCLAW_HOME, home) || home;
  const stateDir = userPath(env.OPENCLAW_STATE_DIR, openclawHome) || join(openclawHome, '.openclaw');
  const configPath = userPath(options.openclawConfig, openclawHome) || userPath(env.OPENCLAW_CONFIG_PATH, openclawHome) || join(stateDir, 'openclaw.json');
  const openclaw = JSON.parse(await readFile(configPath, 'utf8'));
  return {
    instance,
    ...resolveGateway(openclaw, env),
    sdk: options.gatewaySdk || join(home, '.local/share/openclaw-node/node_modules/openclaw/dist/plugin-sdk/gateway-runtime.js'),
    python: options.python || '/usr/bin/python3',
    sessionKey: options.sessionKey || 'agent:main:main',
    voice: options.voice || 'cove',
    // Stable PipeWire/PulseAudio device names, stored outside the checkout.
    inputDevice: options.inputDevice,
    outputDevice: options.outputDevice,
    // Configuring models never arms input; only an explicit control command can.
    wake: options.wake,
  };
}
