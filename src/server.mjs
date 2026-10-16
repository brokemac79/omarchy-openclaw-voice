import { join } from 'node:path';
import { loadGatewaySdk } from './gateway-sdk.mjs';
import { createConnectionStatus } from './gateway-connection.mjs';
import { loadConfig } from './config.mjs';
import { createState } from './state.mjs';
import { launchEngine } from './native-engine.mjs';
import { VoiceSession } from './session.mjs';
import { EngineOwner } from './engine-owner.mjs';
import { launchWakeDetector } from './wake-detector.mjs';
import { listenControl } from './control.mjs';
import { MODEL } from './policy.mjs';
import { VoiceError, failureDetails, gatewayFailure } from './voice-errors.mjs';

const config = await loadConfig();
const syntheticSilence = process.env.OPENCLAW_VOICE_TEST_SILENCE === '1';
if (!process.env.XDG_RUNTIME_DIR) throw new Error('Run inside your Linux user session.');
const runtime = join(process.env.XDG_RUNTIME_DIR, config.instance.basename);
// Fail before acquiring control or connecting if the selected SDK is unavailable.
const { sdk: { GatewayClient, startGatewayClientWhenEventLoopReady }, binding: gatewaySdk } = await loadGatewaySdk(config.sdk);
const connection = createConnectionStatus();
let connected = false, shuttingDown = false, owner, session, native;
const status = () => ({ connected, requested: owner.requested, active: owner.active,
  standby: owner.standby, standbyStarting: owner.standbyStarting, wakeMode: owner.wakeMode,
  wakeEnabled: config.wake?.enabled === true && !syntheticSilence,
  wakeModes: ['conversation'], singleRequestQualified: false, wakeToReadyMs: owner.wakeToReadyMs,
  muted: owner.muteConfirmed, muteRequested: owner.muted, engineStarting: owner.engineStarting,
  syntheticSilence, engine: 'gstreamer', model: MODEL, instance: config.instance.name,
  gatewayConnection: connection.get(), gatewaySdk, diagnostics: owner.readiness.snapshot(), ...native.get() });
// Acquire control before updating the orb, so a second daemon cannot reset it.
const control = await listenControl(runtime, async (command, invocation = {}) => {
  if (!owner || shuttingDown) throw new Error('Voice is not ready.');
  switch (command) {
    case 'status': return status();
    case 'diagnostics': return { ...owner.readiness.snapshot(), ready: owner.active,
      gatewayConnected: connected, errorCode: owner.failure?.code ?? null, startupStage: owner.startupStage };
    case 'preflight':
      try { return { ready: true, ...await session.preflight() }; }
      catch (error) { return { ready: false, failure: failureDetails(error) }; }
    case 'toggle':
      if (owner.requested) await owner.stop();
      else if (!connected) await owner.fail(new VoiceError('gateway_unavailable'));
      else void owner.start(invocation);
      return status();
    case 'stop': await owner.stop(); return status();
    case 'quiet': owner.quiet(true); return status();
    case 'resume-speech': owner.quiet(false); return status();
    case 'cancel-request': return { ...status(), cancellation: owner.cancelRequest() };
    case 'dismiss-result': owner.dismissResult(); return status();
    case 'standby-once':
    case 'standby-conversation':
      if (!connected || syntheticSilence || config.wake?.enabled !== true) throw new Error('Wake unavailable.');
      void owner.arm(command === 'standby-once' ? 'one-request' : 'conversation');
      return status();
    case 'mute': owner.mute(); return status();
    default: throw new Error('Unknown operation.');
  }
});
native = await createState(runtime);
const client = new GatewayClient({
  url: config.gatewayUrl, deviceAuthScope: config.gatewayUrl,
  ...config.gatewayAuth,
  clientName: 'gateway-client', clientDisplayName: 'OpenClaw Voice', clientVersion: '0.4.1', mode: 'ui',
  scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals'],
  minProtocol: 4, maxProtocol: 4,
  onHelloOk: hello => { connection.accept(hello); connected = true; owner.setGatewayConnected(true); },
  onConnectError: error => {
    connection.clear(); connected = false; owner.setGatewayConnected(false);
    if (!shuttingDown) void owner.fail(gatewayFailure(error));
  },
  onClose: () => {
    connection.clear(); connected = false;
    owner.setGatewayConnected(false);
    if (!shuttingDown && (owner.requested || owner.standby || !owner.failure)) void owner.fail(new VoiceError('gateway_disconnected'));
  },
  onEvent: event => {
    if (event.event !== 'talk.event' || !session.grant || event.payload?.voiceSessionId !== session.grant.voiceSessionId) return;
    const talk = event.payload.talkEvent;
    if (!talk) return;
    if (talk.type === 'session.error') void owner.fail(new VoiceError('provider_session_error'));
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
  wakePhrase: config.wake?.backend === 'sherpa-onnx' ? config.wake.phrase : undefined,
  launch: callbacks => launchEngine(config, session, { ...callbacks, syntheticSilence }),
  launchWake: !syntheticSilence && config.wake?.enabled === true
    ? callbacks => launchWakeDetector(config, callbacks) : undefined,
});
owner.setGatewayConnected(false);
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
