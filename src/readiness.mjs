// Only closed milestones, durations and error codes leave this bounded recorder.
export const monotonicNow = () => Number(process.hrtime.bigint()) / 1e6;
const milestones = new Set(['invoked', 'native-worker-ready', 'voice-checks-started', 'voice-checks-passed',
  'reservation-started', 'provider-reserved', 'audio-requested', 'offer-started', 'offer-answered',
  'transport-ready', 'capture-ready', 'talk-ready', 'ready', 'stopped', 'failed']);
const elapsed = (end, start) => Number.isFinite(end) && Number.isFinite(start) && end >= start ? Math.round(end - start) : null;

export class Readiness {
  constructor(now = monotonicNow) { this.now = now; this.reset(); }
  reset() {
    this.started = null; this.marks = {}; this.events = []; this.turns = new Map();
    this.lastSequence = -1;
    this.firstReply = { ms: null, marker: null, unavailable: 'not_observed' };
  }
  begin(invokedAtMs) {
    this.reset(); const now = this.now();
    this.started = Number.isFinite(invokedAtMs) && invokedAtMs >= 0 && invokedAtMs <= now && now - invokedAtMs <= 120000 ? invokedAtMs : now;
    this.mark('invoked');
  }
  mark(stage) {
    if (this.started === null || !milestones.has(stage) || this.marks[stage] !== undefined) return;
    this.marks[stage] = this.now();
    this.events.push({ stage, elapsedMs: elapsed(this.marks[stage], this.started) });
    if (this.events.length > 24) this.events.shift();
  }
  talk(event) {
    if (Number.isSafeInteger(event.seq)) {
      if (event.seq <= this.lastSequence) return;
      this.lastSequence = event.seq;
    }
    const text = event.payload?.text ?? event.payload?.delta;
    const input = event.type === 'input.audio.committed' || (event.type === 'transcript.done'
      && (!event.payload?.role || event.payload.role === 'user') && typeof text === 'string' && text.trim().length > 0);
    const reply = event.type === 'output.audio.started' || (['output.text.delta', 'output.text.done'].includes(event.type) && typeof text === 'string' && text.length > 0);
    if (!input && !reply) return;
    if (typeof event.turnId !== 'string' || !event.turnId || event.turnId.length > 256) {
      this.firstReply = { ms: null, marker: null, unavailable: 'missing_turn_correlation' }; return;
    }
    let turn = this.turns.get(event.turnId);
    if (!turn) {
      turn = {}; this.turns.set(event.turnId, turn);
      if (this.turns.size > 8) this.turns.delete(this.turns.keys().next().value);
    }
    if (input && turn.input === undefined) {
      turn.input = this.now(); turn.marker = event.type === 'input.audio.committed' ? 'speech_commit' : 'transcript_final';
    }
    if (reply && turn.reply === undefined) turn.reply = this.now();
    if (turn.input !== undefined) {
      const ms = elapsed(turn.reply, turn.input);
      this.firstReply = { ms, marker: turn.marker,
        unavailable: ms !== null ? null : turn.reply !== undefined ? 'input_marker_late' : 'reply_not_observed' };
    }
  }
  snapshot() {
    const duration = (end, start) => elapsed(this.marks[end], this.marks[start]);
    return { invocationToReadyMs: elapsed(this.marks.ready, this.started),
      localWorkerPreparationMs: duration('native-worker-ready', 'invoked'),
      gatewayChecksMs: duration('voice-checks-passed', 'voice-checks-started'),
      providerReservationMs: duration('provider-reserved', 'reservation-started'),
      connectionExchangeMs: duration('offer-answered', 'offer-started'),
      requestToFirstReplyMs: this.firstReply.ms, requestMarker: this.firstReply.marker,
      firstReplyUnavailable: this.firstReply.unavailable,
      agentWorkMs: null, networkOnlyMs: null,
      events: this.events.map(event => ({ ...event })) };
  }
}
