import { Transcript } from './transcript.mjs';
import { Readiness, monotonicNow } from './readiness.mjs';
import { VoiceError, failureDetails } from './voice-errors.mjs';
import { ActionProgress } from './action-progress.mjs';

// Serializes microphone ownership across startup, cancellation and replacement.
export class EngineOwner {
  constructor({ session, launch, launchWake, native, wakePhrase, now = monotonicNow, singleRequestBoundary = false,
    getDestination = () => ({}), getAudio = () => ({}), onStopped = () => {} }) {
    Object.assign(this, { session, launch, launchWake, native, wakePhrase, now, getDestination, getAudio, onStopped });
    this.singleRequestBoundary = singleRequestBoundary;
    this.requested = this.active = this.muted = this.muteConfirmed = this.engineStarting = false;
    this.epoch = 0; this.engine = null;
    this.cleanup = this.startup = Promise.resolve();
    this.lastSeen = this.startedAt = 0;
    this.phase = 'idle'; this.caption = 'Microphone off';
    this.transcript = new Transcript();
    this.detector = null; this.standby = this.standbyStarting = false;
    this.wakeMode = 'off'; this.turnEndedAt = null; this.lastOutput = 0;
    this.mediaCleanup = Promise.resolve(); this.mediaFault = false;
    this.wakePending = Promise.resolve(); this.wakeAbort = null;
    this.wakeDetectedAt = null; this.wakeToReadyMs = null;
    this.sessionReady = this.transportActive = false;
    this.outputMuted = this.outputMuteConfirmed = false;
    this.lastResult = '';
    this.answer = this.transcript.getAnswer();
    this.actions = new ActionProgress();
    this.reviewRequired = false;
    this.readiness = new Readiness(now); this.failure = null; this.gatewayConnected = true;
    this.startupStage = null; this.captureReady = false;
  }
  releaseDetector() {
    const detector = this.detector; this.detector = null;
    this.wakeAbort?.abort(); this.wakeAbort = null;
    const pending = this.wakePending; this.wakePending = Promise.resolve();
    this.standby = this.standbyStarting = false;
    // A failed release must never permit a second microphone owner.
    this.mediaCleanup = Promise.all([this.mediaCleanup, pending, detector?.close()]).catch(() => { this.mediaFault = true; });
  }
  arm(mode) {
    if (!['one-request', 'conversation'].includes(mode)) throw new Error('Choose a wake mode.');
    // Current native Talk turn.ended is a provider response boundary, including
    // acknowledgments before agent work finishes. Do not ship it as a reliable
    // one-request completion signal. Keep the lifecycle exercisable by fixtures.
    if (mode === 'one-request' && !this.singleRequestBoundary) throw new Error('One-request completion is not qualified for this Talk route.');
    if (this.requested || this.standby || this.standbyStarting) throw new Error('Stop voice before arming standby.');
    if (!this.launchWake || this.mediaFault) throw new Error('Local wake detector is unavailable.');
    this.failure = null;
    this.wakeMode = mode; this.standbyStarting = true;
    this.phase = 'connecting'; this.caption = 'Starting local wake detector'; this.render();
    const epoch = ++this.epoch, previous = this.startup;
    const work = (async () => {
      await previous; await this.cleanup; await this.mediaCleanup;
      if (epoch !== this.epoch) return;
      try {
        if (this.mediaFault) throw new Error('Audio release failed.');
        const aborter = new AbortController(); this.wakeAbort = aborter;
        const acquisition = this.launchWake({ signal: aborter.signal,
          onWake: () => {
            if (epoch === this.epoch && this.standby) {
              this.wakeDetectedAt = this.now(); void this.start({ wake: true });
            }
          },
          onFailure: () => { if (epoch === this.epoch) void this.fail(new VoiceError('wake_unavailable')); },
        });
        this.wakePending = Promise.resolve(acquisition).then(candidate => {
          if (epoch !== this.epoch) return candidate.close();
        }, () => {});
        const candidate = await acquisition;
        if (epoch !== this.epoch) return;
        this.detector = candidate; this.standbyStarting = false; this.standby = true;
        const phrase = this.wakePhrase ? ` · “${this.wakePhrase}”` : '';
        this.phase = 'standby'; this.caption = `Standby: local microphone${phrase} · ${mode === 'one-request' ? 'one request' : 'open conversation'}`;
        this.render();
      } catch (error) { if (epoch === this.epoch) await this.fail(error, 'wake_unavailable'); }
    })();
    this.startup = work.catch(() => {});
    return work;
  }
  start({ wake = false, invokedAtMs } = {}) {
    if (this.requested) return this.startup;
    if (!wake) this.wakeMode = 'off';
    if (!wake) this.wakeDetectedAt = null;
    this.wakeToReadyMs = null;
    this.sessionReady = this.transportActive = this.captureReady = false;
    this.readiness.begin(invokedAtMs); this.failure = null; this.startupStage = 'native-worker';
    this.releaseDetector(); this.turnEndedAt = null;
    this.requested = true; this.muted = this.muteConfirmed = false;
    this.outputMuted = this.outputMuteConfirmed = false;
    this.lastResult = '';
    this.actions.clear();
    this.reviewRequired = true;
    this.transcript.clear();
    this.answer = this.transcript.getAnswer();
    const epoch = ++this.epoch, previous = this.startup;
    this.phase = 'connecting'; this.caption = 'Connecting to OpenClaw — wait for Talk'; this.render();
    const work = (async () => {
      await previous;
      if (epoch !== this.epoch) return;
      this.engineStarting = true;
      try {
        await this.cleanup;
        await this.mediaCleanup;
        if (epoch !== this.epoch) return;
        if (this.mediaFault) throw new Error('Audio release failed.');
        const candidate = await this.launch({
          onFailure: error => { if (epoch === this.epoch) void this.fail(error, 'audio_setup_failed'); },
          onTelemetry: data => { if (epoch === this.epoch) this.telemetry(data); },
          onProgress: stage => { if (epoch === this.epoch && this.requested) this.progress(stage); },
        });
        if (epoch !== this.epoch) { await candidate.close(); return; }
        this.engine = candidate; this.lastSeen = this.startedAt = this.now();
        await candidate.start({ muted: this.muted, outputMuted: this.outputMuted });
        if (epoch === this.epoch) this.lastSeen = this.startedAt = this.now();
      } catch (error) {
        if (epoch === this.epoch) await this.fail(error);
      } finally { if (epoch === this.epoch) this.engineStarting = false; }
    })();
    this.startup = work.catch(() => {});
    return work;
  }
  async stop(message) {
    const epoch = ++this.epoch;
    this.wakeMode = 'off'; this.turnEndedAt = null; this.releaseDetector();
    this.requested = this.active = this.muted = this.muteConfirmed = this.engineStarting = false;
    this.outputMuted = this.outputMuteConfirmed = false;
    this.sessionReady = this.transportActive = this.captureReady = false;
    this.readiness.mark('stopped'); this.startupStage = null;
    this.native.levels(0, 0);
    this.transcript.clear();
    this.actions.end();
    this.phase = 'stopping'; this.caption = 'Releasing microphone'; this.render();
    const old = this.engine; this.engine = null;
    // Release devices immediately, even when gateway cleanup is waiting for a late grant.
    this.mediaCleanup = Promise.all([this.mediaCleanup, old?.close()]).catch(() => { this.mediaFault = true; });
    this.cleanup = Promise.allSettled([this.cleanup, this.mediaCleanup, this.session.close()]);
    await this.mediaCleanup;
    if (epoch === this.epoch) {
      this.phase = message || this.mediaFault ? 'error' : 'idle';
      if (this.mediaFault) this.failure = failureDetails(new VoiceError('release_unconfirmed'));
      this.caption = this.mediaFault ? 'Audio release unconfirmed. Stop the companion service.' : message || 'Microphone off';
      this.onStopped();
      this.render();
    }
    await this.cleanup;
  }
  async fail(error, fallback) {
    this.failure = failureDetails(error, fallback);
    this.readiness.mark('failed');
    await this.stop(this.failure.message);
  }
  async setGatewayConnected(value) {
    this.gatewayConnected = value === true;
    if (value && !this.requested && (this.failure?.code.startsWith('gateway_') || ['pairing_required', 'pairing_failed'].includes(this.failure?.code))) {
      const epoch = this.epoch;
      await this.mediaCleanup;
      if (epoch !== this.epoch || !this.gatewayConnected || this.mediaFault) return;
      this.failure = null; this.phase = 'idle'; this.caption = 'Microphone off';
    }
    this.render();
  }
  progress(stage) {
    this.readiness.mark(stage);
    const stages = { 'native-worker-ready': 'voice-checks', 'voice-checks-started': 'voice-checks',
      'voice-checks-passed': 'provider-session', 'reservation-started': 'provider-session',
      'provider-reserved': 'audio-setup', 'audio-requested': 'audio-setup',
      'offer-started': 'connection-exchange', 'offer-answered': 'talk-connection' };
    if (Object.hasOwn(stages, stage)) this.startupStage = stages[stage];
    this.render();
  }
  mute() {
    // In standby, mute means fully disarm and release input. It cannot wake.
    if (this.standby || this.standbyStarting) { void this.stop(); return; }
    if (!this.requested) return;
    if (this.turnEndedAt !== null) return;
    this.muted = !this.muted; this.engine?.mute(this.muted);
    this.render();
  }
  quiet(value = true) {
    if (!this.requested) return;
    this.outputMuted = value === true;
    this.engine?.quiet(this.outputMuted);
    this.render();
  }
  cancelRequest() {
    // talk.client.steer selects by session, not this call and exact request.
    // Never substitute whole-session abort, provider-turn completion or Stop.
    return { outcome: 'unavailable', reason: 'exact_request_control_unavailable' };
  }
  dismissResult() {
    this.lastResult = ''; this.actions.dismiss();
    this.transcript.clearAnswer(); this.answer = this.transcript.getAnswer();
    if (!this.requested && !this.standby && !this.standbyStarting) this.reviewRequired = false;
    this.render();
  }
  controls() {
    return { callRequested: this.requested, inputMuted: this.muteConfirmed,
      inputMuteRequested: this.muted, speechQuiet: this.outputMuteConfirmed,
      speechQuietRequested: this.outputMuted, workStatus: 'unknown',
      cancelAvailable: false, lastResult: this.lastResult,
      answer: this.answer,
      audio: this.getAudio(),
      ...this.actions.snapshot(),
      reviewRequired: this.reviewRequired, ...this.getDestination(),
      startupStage: this.startupStage, errorCode: this.failure?.code ?? null,
      recoveryAction: this.failure?.recovery ?? '' };
  }
  telemetry(data) {
    this.lastSeen = this.now();
    this.transportActive = data.active === true;
    this.captureReady = data.captureReady === true;
    if (!this.active && (this.transportActive || this.captureReady)) this.startupStage = 'talk-connection';
    if (this.transportActive) this.readiness.mark('transport-ready');
    if (this.captureReady) this.readiness.mark('capture-ready');
    this.updateReadiness();
    this.muteConfirmed = data.muted === true;
    this.outputMuteConfirmed = data.outputMuted === true;
    if (data.output > 0.01) this.lastOutput = this.now();
    this.native.levels(this.muteConfirmed ? 0 : data.input, this.outputMuteConfirmed ? 0 : data.output);
    this.render();
  }
  talk(data) {
    if (!this.requested) return;
    this.actions.accept(data);
    if (data.type === 'session.ready') { this.sessionReady = true; this.readiness.mark('talk-ready'); this.updateReadiness(); }
    this.readiness.talk(data);
    if (data.type === 'turn.ended' && this.wakeMode === 'one-request' && this.turnEndedAt === null) {
      this.turnEndedAt = this.lastOutput = this.now();
      this.muted = true; this.engine?.mute(true);
    }
    const acceptedText = this.transcript.accept(data);
    if (acceptedText && data.type.startsWith('output.text.')) this.answer = this.transcript.getAnswer();
    if (acceptedText && data.type === 'output.text.done') this.lastResult = this.transcript.get().assistant;
    const phases = { 'transcript.delta': 'listening', 'transcript.done': 'thinking',
      'output.audio.started': 'acting', 'output.audio.done': 'listening',
      'output.text.delta': 'acting', 'output.text.done': 'listening',
      'turn.ended': 'listening', 'tool.call': 'acting' };
    if (phases[data.type]) this.phase = phases[data.type];
    this.caption = { listening: 'Listening', thinking: 'Thinking', acting: 'OpenClaw is responding' }[this.phase] || this.caption;
    this.render();
  }
  updateReadiness() {
    const active = this.transportActive && this.captureReady && this.sessionReady;
    if (active && !this.active) { this.phase = 'listening'; this.caption = 'Talk ready — Listening'; }
    this.active = active;
    if (active) { this.readiness.mark('ready'); this.startupStage = null; }
    if (active && this.wakeDetectedAt !== null && this.wakeToReadyMs === null) {
      this.wakeToReadyMs = Math.max(0, Math.round(this.now() - this.wakeDetectedAt));
    }
  }
  render() {
    const audio = this.getAudio();
    if (audio.releaseUnconfirmed || ['starting', 'checking', 'stopping'].includes(audio.check?.phase)) {
      this.native.set(audio.releaseUnconfirmed ? 'error' : 'checking', audio.releaseUnconfirmed
        ? 'Audio release unconfirmed. Stop the companion service.' : audio.check.phase === 'stopping' ? 'Releasing local audio check'
          : 'Local speaker check · Test tone · Microphone off', {}, this.controls());
      return;
    }
    const mode = this.requested && this.wakeMode !== 'off'
      ? ` · ${this.wakeMode === 'one-request' ? 'returns to standby' : 'open conversation'}` : '';
    const connecting = this.requested && !this.active;
    const waitingGateway = !this.gatewayConnected && !this.requested && !this.failure && !this.standby && !this.standbyStarting;
    const preparing = connecting && ['native-worker', 'voice-checks', 'provider-session', 'audio-setup'].includes(this.startupStage);
    const startupText = ({ 'native-worker': 'Preparing local voice worker', 'voice-checks': 'Checking voice configuration',
      'provider-session': 'Preparing voice session', 'audio-setup': 'Preparing microphone and playback',
      'connection-exchange': 'Connecting voice transport', 'talk-connection': 'Waiting for microphone and Talk readiness' })[this.startupStage];
    this.native.set(preparing ? 'preparing' : connecting || waitingGateway ? 'connecting' : this.phase,
      (connecting ? startupText || 'Connecting to OpenClaw — wait for Talk' : waitingGateway ? 'Connecting to Gateway · Microphone off'
        : this.muteConfirmed ? 'Microphone muted' : this.caption) + mode,
      this.transcript.get(), this.controls());
  }
  checkHealth() {
    if (!this.requested || !this.engine) return;
    // Heartbeats alone cannot keep a never-connected call alive indefinitely.
    const elapsed = this.now() - this.startedAt;
    if (this.turnEndedAt !== null && this.active && this.muteConfirmed && this.now() - this.lastOutput >= 1500) {
      const epoch = this.epoch;
      // Only the explicitly selected one-request mode can rearm. Errors, user
      // Stop and disconnect invalidate this continuation, including during cleanup.
      void (async () => {
        await this.stop();
        if (this.epoch === epoch + 1 && !this.mediaFault) await this.arm('one-request');
      })();
      return;
    }
    if (this.turnEndedAt !== null && this.now() - this.turnEndedAt > 30000) {
      void this.stop('Could not confirm quiet playback. Microphone off.'); return;
    }
    const timedOut = this.engineStarting ? elapsed > 50000
      : this.now() - this.lastSeen > 10000 || (!this.active && elapsed > 45000);
    if (timedOut) {
      void this.fail(new VoiceError('audio_setup_timeout'));
    }
  }
}
