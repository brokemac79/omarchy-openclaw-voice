import { Transcript } from './transcript.mjs';

// Serializes microphone ownership across startup, cancellation and replacement.
export class EngineOwner {
  constructor({ session, launch, native, now = Date.now }) {
    Object.assign(this, { session, launch, native, now });
    this.requested = this.active = this.muted = this.muteConfirmed = this.engineStarting = false;
    this.epoch = 0; this.engine = null;
    this.cleanup = this.startup = Promise.resolve();
    this.lastSeen = this.startedAt = 0;
    this.phase = 'idle'; this.caption = 'Microphone off';
    this.transcript = new Transcript();
  }
  start() {
    if (this.requested) return this.startup;
    this.requested = true; this.muted = this.muteConfirmed = false;
    this.transcript.clear();
    const epoch = ++this.epoch, previous = this.startup;
    this.phase = 'thinking'; this.caption = 'Connecting to OpenClaw'; this.render();
    const work = (async () => {
      await previous;
      if (epoch !== this.epoch) return;
      this.engineStarting = true;
      try {
        await this.cleanup;
        if (epoch !== this.epoch) return;
        const candidate = await this.launch({
          onFailure: message => { if (epoch === this.epoch) void this.stop(message); },
          onTelemetry: data => { if (epoch === this.epoch) this.telemetry(data); },
        });
        if (epoch !== this.epoch) { await candidate.close(); return; }
        this.engine = candidate; this.lastSeen = this.startedAt = this.now();
        await candidate.start({ muted: this.muted });
        if (epoch === this.epoch) this.lastSeen = this.startedAt = this.now();
      } catch {
        if (epoch === this.epoch) await this.stop('Could not start voice. Check OAuth, gateway and audio devices.');
      } finally { if (epoch === this.epoch) this.engineStarting = false; }
    })();
    this.startup = work.catch(() => {});
    return work;
  }
  async stop(message) {
    this.epoch++;
    this.requested = this.active = this.muted = this.muteConfirmed = this.engineStarting = false;
    this.native.levels(0, 0);
    this.transcript.clear();
    this.phase = message ? 'error' : 'idle'; this.caption = message || 'Microphone off'; this.render();
    const old = this.engine; this.engine = null;
    // Release devices immediately, even when gateway cleanup is waiting for a late grant.
    this.cleanup = Promise.allSettled([this.cleanup, old?.close(), this.session.close()]);
    await this.cleanup;
  }
  mute() {
    if (!this.requested) return;
    this.muted = !this.muted; this.engine?.mute(this.muted);
  }
  telemetry(data) {
    this.lastSeen = this.now();
    if (data.active === true && !this.active) { this.phase = 'listening'; this.caption = 'Listening'; }
    this.active = data.active === true;
    this.muteConfirmed = data.muted === true;
    this.native.levels(this.muteConfirmed ? 0 : data.input, data.output);
    this.render();
  }
  talk(data) {
    if (!this.requested) return;
    this.transcript.accept(data);
    const phases = { 'transcript.delta': 'listening', 'transcript.done': 'thinking',
      'output.audio.started': 'acting', 'output.audio.done': 'listening',
      'output.text.delta': 'acting', 'output.text.done': 'listening',
      'turn.ended': 'listening', 'tool.call': 'acting' };
    if (phases[data.type]) this.phase = phases[data.type];
    this.caption = { listening: 'Listening', thinking: 'Thinking', acting: 'OpenClaw is responding' }[this.phase] || this.caption;
    this.render();
  }
  render() { this.native.set(this.phase, this.muteConfirmed ? 'Microphone muted' : this.caption, this.transcript.get()); }
  checkHealth() {
    if (!this.requested || !this.engine) return;
    // Heartbeats alone cannot keep a never-connected call alive indefinitely.
    const elapsed = this.now() - this.startedAt;
    const timedOut = this.engineStarting ? elapsed > 50000
      : this.now() - this.lastSeen > 10000 || (!this.active && elapsed > 45000);
    if (timedOut) {
      void this.stop('Audio connection timed out. Microphone off.');
    }
  }
}
