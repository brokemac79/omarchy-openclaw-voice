import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { createState } from './state.mjs';
import { launchEngine } from './native-engine.mjs';
import { VoiceSession } from './session.mjs';
import { EngineOwner } from './engine-owner.mjs';
import { listenControl } from './control.mjs';
import { MODEL } from './policy.mjs';

const config = await loadConfig();
const syntheticSilence = process.env.OPENCLAW_VOICE_TEST_SILENCE === '1';
if (!process.env.XDG_RUNTIME_DIR) throw new Error('Run inside your Linux user session.');
const runtime = join(process.env.XDG_RUNTIME_DIR, 'openclaw-voice');
let connected = false, shuttingDown = false, owner, session, native;
const status = () => ({ connected, requested: owner.requested, active: owner.active,
  muted: owner.muteConfirmed, muteRequested: owner.muted, engineStarting: owner.engineStarting,
  syntheticSilence, engine: 'gstreamer', model: MODEL, ...native.get() });
// Acquire control before updating the orb, so a second daemon cannot reset it.
const control = await listenControl(runtime, async command => {
  if (!owner || shuttingDown) throw new Error('Voice is not ready.');
  switch (command) {
    case 'status': return status();
    case 'preflight': return session.preflight();
    case 'toggle':
      if (owner.requested) await owner.stop();
      else if (!connected) throw new Error('Gateway unavailable.');
      else void owner.start();
      return status();
    case 'stop': await owner.stop(); return status();
    case 'mute': owner.mute(); return status();
    default: throw new Error('Unknown operation.');
  }
});
native = await createState(runtime);
const { GatewayClient, startGatewayClientWhenEventLoopReady } = await import(pathToFileURL(config.sdk));
const client = new GatewayClient({
  url: config.gatewayUrl, deviceAuthScope: config.gatewayUrl,
  clientName: 'gateway-client', clientDisplayName: 'OpenClaw Voice', clientVersion: '0.3.1', mode: 'backend',
  scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals'],
  minProtocol: 4, maxProtocol: 4,
  onHelloOk: () => { connected = true; if (!owner.requested) native.set('idle', 'Microphone off'); },
  onConnectError: () => { connected = false; if (!shuttingDown) void owner.stop('Gateway connection unavailable.'); },
  onClose: () => {
    connected = false;
    if (!shuttingDown) void owner.stop(owner.requested ? 'Gateway disconnected. Microphone off.' : undefined);
  },
  onEvent: event => {
    if (event.event !== 'talk.event' || !session.grant || event.payload?.voiceSessionId !== session.grant.voiceSessionId) return;
    const talk = event.payload.talkEvent;
    if (!talk) return;
    if (talk.type === 'session.error') void owner.stop('Voice session ended with an error.');
    else if (talk.type === 'session.closed') void owner.stop();
    else owner.talk(talk);
  },
});
const rpc = (method, params = {}) => {
  if (!connected) return Promise.reject(new Error('Gateway unavailable.'));
  return client.request(method, params, { timeoutMs: 15000 });
};
session = new VoiceSession(rpc, config.sessionKey, config.voice);
owner = new EngineOwner({ session, native,
  launch: callbacks => launchEngine(config, session, { ...callbacks, syntheticSilence }),
});
const healthTimer = setInterval(() => owner.checkHealth(), 1000);
healthTimer.unref();
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true; clearInterval(healthTimer);
  // systemd also kills the whole control group if a provider cleanup stalls.
  await owner.stop(); await client.stopAndWait(); await native.close(); await control.close(); process.exit(code);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
await startGatewayClientWhenEventLoopReady(client);
