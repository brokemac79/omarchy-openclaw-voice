import test from 'node:test';
import assert from 'node:assert/strict';
import { Readiness } from '../src/readiness.mjs';
import { EngineOwner } from '../src/engine-owner.mjs';
import { VoiceSession } from '../src/session.mjs';
import { VoiceError, failureDetails, gatewayFailure } from '../src/voice-errors.mjs';

function fixture() {
  let now = 100, launches = 0, closes = 0;
  const states = [], callbacks = [];
  const owner = new EngineOwner({ now: () => now, session: { close: async () => {} },
    native: { set: (...args) => states.push(args), levels() {} },
    launch: async cb => { launches++; callbacks.push(cb); cb.onProgress('native-worker-ready');
      return { start: async () => {}, close: async () => { closes++; } }; },
  });
  return { owner, states, callbacks, at: value => { now = value; }, launches: () => launches, closes: () => closes };
}

test('Listening waits for actual microphone frames, transport and Talk; invocation time includes the launcher wait', async () => {
  const f = fixture(); await f.owner.start({ invokedAtMs: 25 });
  assert.equal(f.states.at(-1)[0], 'preparing');
  f.at(200); f.owner.talk({ type: 'session.ready' });
  f.owner.telemetry({ active: true, input: 0, output: 0 });
  assert.equal(f.owner.active, false); assert.equal(f.states.at(-1)[0], 'connecting');
  f.owner.talk({ type: 'output.text.delta', turnId: 'early-turn', payload: { text: 'Early reply' } });
  assert.doesNotMatch(f.states.at(-1)[1], /Listening/);
  assert.equal(f.owner.readiness.snapshot().invocationToReadyMs, null);
  f.at(350); f.owner.telemetry({ active: true, captureReady: true, input: 0, output: 0 });
  assert.equal(f.owner.active, true); assert.equal(f.states.at(-1)[0], 'listening');
  assert.match(f.states.at(-1)[1], /Talk ready/);
  assert.equal(f.owner.readiness.snapshot().invocationToReadyMs, 325);
  await f.owner.stop();
});

test('preparation milestones remain observable without percentages or premature readiness', async () => {
  const f = fixture(); await f.owner.start();
  const cb = f.callbacks[0];
  for (const [stage, expected] of [['voice-checks-started', 'preparing'], ['reservation-started', 'preparing'],
    ['provider-reserved', 'preparing'], ['offer-started', 'connecting'], ['offer-answered', 'connecting']]) {
    cb.onProgress(stage); assert.equal(f.states.at(-1)[0], expected);
    assert.equal(f.owner.active, false); assert.doesNotMatch(f.states.at(-1)[1], /Listening|%/);
  }
  f.at(50000); f.owner.checkHealth(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.owner.requested, false); assert.equal(f.closes(), 1);
  assert.equal(f.owner.controls().errorCode, 'audio_setup_timeout');
  assert.match(f.owner.controls().recoveryAction, /Check/);
  await f.owner.start();
  const before = f.owner.readiness.snapshot();
  cb.onProgress('offer-answered'); cb.onFailure(new VoiceError('provider_not_ready'));
  assert.deepEqual(f.owner.readiness.snapshot(), before);
  await f.owner.stop();
});

test('Gateway reconnect clears connection failures without restarting a microphone or retrying a request', async () => {
  const f = fixture(); f.owner.setGatewayConnected(false);
  assert.equal(f.states.at(-1)[0], 'connecting');
  await f.owner.fail(gatewayFailure({ details: { code: 'PAIRING_REQUIRED', token: 'synthetic-secret' } }));
  assert.equal(f.owner.controls().errorCode, 'pairing_required');
  assert.match(f.owner.controls().recoveryAction, /Approve/);
  await f.owner.setGatewayConnected(true);
  assert.equal(f.owner.controls().errorCode, null); assert.equal(f.states.at(-1)[0], 'idle');
  assert.equal(f.launches(), 0); assert.equal(f.owner.requested, false);
  assert.equal(f.owner.standby, false);
});

test('fast Gateway recovery cannot claim microphone Off before the old worker releases', async () => {
  const f = fixture(); let release;
  f.owner.launch = async () => ({ start: async () => {}, close: () => new Promise(resolve => { release = resolve; }) });
  await f.owner.start();
  const failure = f.owner.fail(new VoiceError('gateway_disconnected'));
  const recovery = f.owner.setGatewayConnected(true);
  assert.equal(f.states.at(-1)[0], 'stopping');
  release(); await failure; await recovery;
  assert.equal(f.states.at(-1)[0], 'idle'); assert.equal(f.owner.requested, false);
});

test('preflight distinguishes configuration, OAuth, provider readiness and reservation failures without exposing upstream errors', async () => {
  for (const [config, catalog, code] of [[null, {}, 'voice_config_unavailable'],
    [{}, {}, 'oauth_required'],
    [{ auth: { profiles: { test: { provider: 'openai', mode: 'oauth' } } } }, {}, 'provider_not_ready']]) {
    const session = new VoiceSession(async method => method === 'config.get' ? { config } : catalog, 'agent:example:main');
    await assert.rejects(session.preflight(), error => error.code === code);
  }
  const progress = [];
  const session = new VoiceSession(async method => {
    if (method === 'config.get') return { config: { auth: { profiles: { test: { provider: 'openai', mode: 'oauth' } } } } };
    if (method === 'talk.catalog') return { realtime: { ready: true } };
    throw new Error('synthetic-secret at private endpoint');
  }, 'agent:example:main');
  await assert.rejects(session.create(stage => progress.push(stage)), error => {
    assert.equal(error.code, 'provider_session_failed');
    assert.ok(!JSON.stringify(failureDetails(error)).includes('synthetic-secret')); return true;
  });
  assert.deepEqual(progress, ['voice-checks-started', 'voice-checks-passed', 'reservation-started']);
  assert.equal(gatewayFailure(new Error('PAIRING_REQUIRED synthetic-secret')).code, 'gateway_unavailable');
  for (const [code, expected] of [['PAIRING_EXPIRED', 'pairing_failed'], ['AUTH_TOKEN_MISMATCH', 'gateway_auth_required'],
    ['PROTOCOL_MISMATCH', 'gateway_incompatible'], ['AUTH_RATE_LIMITED', 'gateway_rate_limited']]) {
    assert.equal(gatewayFailure({ details: { code } }).code, expected);
  }
});

test('request-to-first-reply timing requires matching turns and reports late or absent markers as unavailable', () => {
  let now = 0; const r = new Readiness(() => now); r.begin();
  r.talk({ type: 'input.audio.committed', turnId: 'turn-a', seq: 1 });
  now = 40; r.talk({ type: 'output.text.delta', turnId: 'turn-b', seq: 2, payload: { text: 'Other reply' } });
  assert.equal(r.snapshot().requestToFirstReplyMs, null);
  now = 90; r.talk({ type: 'output.audio.started', turnId: 'turn-a', seq: 3 });
  assert.equal(r.snapshot().requestToFirstReplyMs, 90);
  now = 150; r.talk({ type: 'output.audio.started', turnId: 'turn-a', seq: 3 });
  assert.equal(r.snapshot().requestToFirstReplyMs, 90);
  r.talk({ type: 'output.audio.started', turnId: 'turn-late', seq: 4 });
  now = 200; r.talk({ type: 'transcript.done', turnId: 'turn-late', seq: 5, payload: { text: 'Late transcription' } });
  assert.equal(r.snapshot().requestToFirstReplyMs, null);
  assert.equal(r.snapshot().firstReplyUnavailable, 'input_marker_late');
  r.talk({ type: 'output.audio.started' });
  assert.equal(r.snapshot().firstReplyUnavailable, 'missing_turn_correlation');
});

test('diagnostics are bounded, monotonic and contain no speech, identifiers, endpoints or invented agent/network timings', () => {
  let now = 1000; const r = new Readiness(() => now);
  r.begin(-1); now = 1050; r.mark('native-worker-ready');
  r.mark('synthetic-secret'); r.mark('native-worker-ready');
  for (let i = 0; i < 100; i++) {
    r.talk({ type: 'transcript.done', turnId: 'private-turn-' + i, payload: { text: 'synthetic-secret' } });
    now++; r.talk({ type: 'output.text.done', turnId: 'private-turn-' + i, payload: { text: 'private endpoint' } });
  }
  assert.equal(r.turns.size, 8); assert.ok(r.snapshot().events.length <= 24);
  const snapshot = r.snapshot();
  assert.ok(!/synthetic-secret|private-turn|private endpoint/.test(JSON.stringify(snapshot)));
  assert.equal(snapshot.localWorkerPreparationMs, 50);
  assert.equal(snapshot.agentWorkMs, null); assert.equal(snapshot.networkOnlyMs, null);
  assert.equal(snapshot.invocationToReadyMs, null);
  r.begin(now + 500); now += 20; r.mark('ready');
  assert.equal(r.snapshot().invocationToReadyMs, 20);
  assert.equal(r.snapshot().requestToFirstReplyMs, null);
});
