import { Transcript } from './transcript.mjs';

// Serializes microphone ownership across startup, cancellation and replacement.
export class EngineOwner {
  constructor({ session, launch, launchWake, native, wakePhrase, now = () => performance.now(), singleRequestBoundary = false }) {
    Object.assign(this, { session, launch, launchWake, native, wakePhrase, now });
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
          onFailure: () => { if (epoch === this.epoch) void this.stop('Local wake detector failed. Microphone off.'); },
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
      } catch { if (epoch === this.epoch) await this.stop('Local wake unavailable. Check model and dependencies.'); }
    })();
    this.startup = work.catch(() => {});
    return work;
  }
  start({ wake = false } = {}) {
    if (this.requested) return this.startup;
    if (!wake) this.wakeMode = 'off';
    if (!wake) this.wakeDetectedAt = null;
    this.wakeToReadyMs = null;
    this.sessionReady = this.transportActive = false;
    this.releaseDetector(); this.turnEndedAt = null;
    this.requested = true; this.muted = this.muteConfirmed = false;
    this.outputMuted = this.outputMuteConfirmed = false;
    this.lastResult = '';
    this.transcript.clear();
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
          onFailure: message => { if (epoch === this.epoch) void this.stop(message); },
          onTelemetry: data => { if (epoch === this.epoch) this.telemetry(data); },
        });
        if (epoch !== this.epoch) { await candidate.close(); return; }
        this.engine = candidate; this.lastSeen = this.startedAt = this.now();
        await candidate.start({ muted: this.muted, outputMuted: this.outputMuted });
        if (epoch === this.epoch) this.lastSeen = this.startedAt = this.now();
      } catch {
        if (epoch === this.epoch) await this.stop('Could not start voice. Check OAuth, gateway and audio devices.');
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
    this.sessionReady = this.transportActive = false;
    this.native.levels(0, 0);
    this.transcript.clear();
    this.phase = 'stopping'; this.caption = 'Releasing microphone'; this.render();
    const old = this.engine; this.engine = null;
    // Release devices immediately, even when gateway cleanup is waiting for a late grant.
    this.mediaCleanup = Promise.all([this.mediaCleanup, old?.close()]).catch(() => { this.mediaFault = true; });
    this.cleanup = Promise.allSettled([this.cleanup, this.mediaCleanup, this.session.close()]);
    await this.mediaCleanup;
    if (epoch === this.epoch) {
      this.phase = message || this.mediaFault ? 'error' : 'idle';
      this.caption = this.mediaFault ? 'Audio release unconfirmed. Stop the companion service.' : message || 'Microphone off';
      this.render();
    }
    await this.cleanup;
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
  dismissResult() { this.lastResult = ''; this.render(); }
  controls() {
    return { callRequested: this.requested, inputMuted: this.muteConfirmed,
      inputMuteRequested: this.muted, speechQuiet: this.outputMuteConfirmed,
      speechQuietRequested: this.outputMuted, workStatus: 'unknown',
      cancelAvailable: false, lastResult: this.lastResult };
  }
  telemetry(data) {
    this.lastSeen = this.now();
    this.transportActive = data.active === true;
    this.updateReadiness();
    this.muteConfirmed = data.muted === true;
    this.outputMuteConfirmed = data.outputMuted === true;
    if (data.output > 0.01) this.lastOutput = this.now();
    this.native.levels(this.muteConfirmed ? 0 : data.input, this.outputMuteConfirmed ? 0 : data.output);
    this.render();
  }
  talk(data) {
    if (!this.requested) return;
    if (data.type === 'session.ready') { this.sessionReady = true; this.updateReadiness(); }
    if (data.type === 'turn.ended' && this.wakeMode === 'one-request' && this.turnEndedAt === null) {
      this.turnEndedAt = this.lastOutput = this.now();
      this.muted = true; this.engine?.mute(true);
    }
    const acceptedText = this.transcript.accept(data);
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
    const active = this.transportActive && this.sessionReady;
    if (active && !this.active) { this.phase = 'listening'; this.caption = 'Talk ready — Listening'; }
    this.active = active;
    if (active && this.wakeDetectedAt !== null && this.wakeToReadyMs === null) {
      this.wakeToReadyMs = Math.max(0, Math.round(this.now() - this.wakeDetectedAt));
    }
  }
  render() {
    const mode = this.requested && this.wakeMode !== 'off'
      ? ` · ${this.wakeMode === 'one-request' ? 'returns to standby' : 'open conversation'}` : '';
    const connecting = this.requested && !this.active;
    this.native.set(connecting ? 'connecting' : this.phase,
      (this.muteConfirmed ? 'Microphone muted' : connecting ? 'Connecting to OpenClaw — wait for Talk' : this.caption) + mode,
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
      void this.stop('Audio connection timed out. Microphone off.');
    }
  }
}
