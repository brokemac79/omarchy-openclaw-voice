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
import { Destinations } from './destinations.mjs';
import { AudioDevices } from './audio-devices.mjs';
import { launchAudioCheck } from './local-audio-check.mjs';

const config = await loadConfig();
const syntheticSilence = process.env.OPENCLAW_VOICE_TEST_SILENCE === '1';
if (!process.env.XDG_RUNTIME_DIR) throw new Error('Run inside your Linux user session.');
const runtime = join(process.env.XDG_RUNTIME_DIR, config.instance.basename);
// Fail before acquiring control or connecting if the selected SDK is unavailable.
const { sdk: { GatewayClient, startGatewayClientWhenEventLoopReady }, binding: gatewaySdk } = await loadGatewaySdk(config.sdk);
const connection = createConnectionStatus();
let connected = false, shuttingDown = false, owner, session, native, destinations, audio;
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
    case 'destinations': await destinations.refresh(); return destinations.snapshot();
    case 'audio-devices': audio.message = ''; await audio.refresh(); return status();
    case 'select-audio-device':
      try { await audio.select(invocation.deviceKind, invocation.deviceId); return { ...status(), audioSelectionChanged: true }; }
      catch (error) { const failure = failureDetails(error, 'audio_selection_invalid');
        audio.message = `${failure.message}. ${failure.recovery}`; owner.render();
        return { ...status(), audioSelectionChanged: false }; }
    case 'audio-speaker-check':
      try { await audio.startCheck('speaker'); }
      catch (error) { const failure = failureDetails(error, 'audio_setup_failed');
        audio.message = `${failure.message}. ${failure.recovery}`; owner.render(); }
      return { ...status(), audioCheckStarted: audio.operation === 'checking' };
    case 'audio-stop-check': await audio.stopCheck(); return status();
    case 'select-destination':
      try { await destinations.select(invocation.destinationId); return { ...status(), selectionChanged: true }; }
      catch (error) { return { ...status(), selectionChanged: false, selectionFailure: failureDetails(error) }; }
    case 'diagnostics': return { ...owner.readiness.snapshot(), ready: owner.active,
      gatewayConnected: connected, errorCode: owner.failure?.code ?? null, startupStage: owner.startupStage };
    case 'preflight':
      try {
        await destinations.refresh();
        if (destinations.snapshot().destination.state !== 'ready') throw new VoiceError('destination_unavailable');
        return { ready: true, ...await session.preflight() };
      }
      catch (error) { return { ready: false, failure: failureDetails(error) }; }
    case 'toggle':
      if (owner.requested) await owner.stop();
      else if (audio.occupied) return { ...status(), startFailure: failureDetails(new VoiceError('audio_busy')) };
      else if (!connected) await owner.fail(new VoiceError('gateway_unavailable'));
      else if (destinations.snapshot().destination.state !== 'ready' || destinations.switching) await owner.fail(new VoiceError('destination_unavailable'));
      else void owner.start(invocation);
      return status();
    case 'stop': await audio.stopCheck(); await owner.stop(); return status();
    case 'quiet': owner.quiet(true); return status();
    case 'resume-speech': owner.quiet(false); return status();
    case 'cancel-request': return { ...status(), cancellation: owner.cancelRequest() };
    case 'dismiss-result': owner.dismissResult(); return status();
    case 'standby-once':
    case 'standby-conversation':
      if (!connected || syntheticSilence || config.wake?.enabled !== true) throw new Error('Wake unavailable.');
      if (audio.occupied) throw new VoiceError('audio_busy');
      if (destinations.snapshot().destination.state !== 'ready' || destinations.switching) throw new VoiceError('destination_unavailable');
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
  clientName: 'gateway-client', clientDisplayName: 'OpenClaw Voice', clientVersion: '0.5.0', mode: 'ui',
  scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals'],
  minProtocol: 4, maxProtocol: 4,
  onHelloOk: hello => { connection.accept(hello); connected = true; destinations.setConnected(true); owner.setGatewayConnected(true); },
  onConnectError: error => {
    connection.clear(); connected = false; destinations.setConnected(false); owner.setGatewayConnected(false);
    if (!shuttingDown) void owner.fail(gatewayFailure(error));
  },
  onClose: () => {
    connection.clear(); connected = false;
    destinations.setConnected(false);
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
destinations = new Destinations({ presets: config.destinations, path: config.selectionPath, rpc,
  canSwitch: () => !!owner && !shuttingDown && !owner.requested && !owner.standby && !owner.standbyStarting
    && !owner.engineStarting && owner.phase !== 'stopping' && !owner.mediaFault && !owner.reviewRequired
    && !audio?.occupied
    && !session.creating && !session.grant,
  settle: async () => { await owner.cleanup; await session.close(); },
  onChange: () => owner?.render(),
  onInvalidated: () => {
    if (owner?.requested || owner?.standby || owner?.standbyStarting) void owner.fail(new VoiceError('destination_unavailable'));
  },
});
await destinations.load();
session = new VoiceSession(rpc, config.sessionKey, config.voice, () => destinations.forCall());
audio = new AudioDevices({ path: config.audioSelectionPath, inputDevice: config.inputDevice, outputDevice: config.outputDevice,
  ...(syntheticSilence ? { discover: async () => ({ input: [{ name: config.inputDevice || 'synthetic-input', label: 'Synthetic microphone' }],
    output: [{ name: config.outputDevice || 'synthetic-output', label: 'Synthetic speaker' }],
    defaults: { input: config.inputDevice || 'synthetic-input', output: config.outputDevice || 'synthetic-output' } }) } : {}),
  canUse: () => !!owner && !shuttingDown && !owner.requested && !owner.standby && !owner.standbyStarting
    && !owner.engineStarting && owner.phase !== 'stopping' && !owner.mediaFault,
  settle: async () => { await owner.cleanup; await owner.mediaCleanup; },
  launch: options => launchAudioCheck(config, { ...options, synthetic: syntheticSilence }),
  onChange: () => owner?.render(),
  onInvalidated: () => { if (owner?.requested || owner?.standby || owner?.standbyStarting) void owner.fail(new VoiceError('audio_device_unavailable')); },
});
await audio.load();
owner = new EngineOwner({ session, native,
  getDestination: () => destinations.snapshot(), getAudio: () => audio.snapshot(),
  onStopped: () => { destinations.endCall(); if (!audio.occupied) audio.binding = null; },
  wakePhrase: config.wake?.backend === 'sherpa-onnx' ? config.wake.phrase : undefined,
  launch: async callbacks => launchEngine({ ...config, ...await audio.forVoice() }, session, { ...callbacks, syntheticSilence }),
  launchWake: !syntheticSilence && config.wake?.enabled === true
    ? async callbacks => launchWakeDetector({ ...config, ...await audio.forVoice(true) }, callbacks) : undefined,
});
owner.setGatewayConnected(false);
const healthTimer = setInterval(() => {
  audio.tick();
  if ((owner.requested || owner.standby || owner.standbyStarting) && destinations.snapshot().destination.state !== 'ready') {
    void owner.fail(new VoiceError('destination_unavailable'));
  } else owner.checkHealth();
  // Discovery can expire while a read is still pending; heartbeat freshness
  // must not make an old destination snapshot look current.
  owner.render();
}, 1000);
healthTimer.unref();
const destinationTimer = setInterval(() => { void destinations.refresh(); }, 30000);
destinationTimer.unref();
const audioTimer = setInterval(() => { void audio.refresh(); }, 2000);
audioTimer.unref();
void audio.refresh();
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true; clearInterval(healthTimer); clearInterval(destinationTimer); clearInterval(audioTimer);
  // systemd also kills the whole control group if a provider cleanup stalls.
  await audio.stopCheck(); await owner.stop(); await client.stopAndWait(); await native.close(); await control.close(); process.exit(code);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
await startGatewayClientWhenEventLoopReady(client);
