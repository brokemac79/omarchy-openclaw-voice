// These are voice-conversation boundaries, never proof of host work completion.
const TURN_LIMIT = 128;
const activityTypes = new Set(['turn.started', 'input.audio.committed', 'transcript.delta', 'transcript.done',
  'output.text.delta', 'output.text.done', 'output.audio.started', 'output.audio.delta', 'output.audio.done',
  'turn.ended', 'turn.cancelled', 'tool.call', 'tool.progress', 'tool.result', 'tool.error']);

export function inactivitySeconds(value = 30) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 3600) {
    throw new Error('wake.inactivitySeconds must be a whole number from 0 to 3600 (0 disables automatic return).');
  }
  return value;
}

export function standbyPhrase(text) {
  if (typeof text !== 'string' || text.length > 256) return false;
  const phrase = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return /^(?:(?:okay|ok)[, ]+)?(?:(?:hey )?open ?claw[, ]+)?(?:(?:can|could|would) you )?(?:please[ ,]+)?(?:(?:return|go|switch)(?: back)? to|back to) (?:stand[ -]?by(?: mode)?|wake(?: word)? listening)(?:[, ]+please)?[.!?]*$/.test(phrase);
}

export class WakeReturn {
  constructor({ seconds = 30, now }) {
    this.seconds = inactivitySeconds(seconds); this.now = now; this.reset();
  }
  reset() {
    this.sequence = -1; this.turns = new Map(); this.blocked = false; this.lastActivity = null;
  }
  ready() { this.lastActivity ??= this.now(); }
  activity() { this.lastActivity = this.now(); }
  telemetry({ input, output }) {
    if ([input, output].some(value => Number.isFinite(value) && value > 0.01)) this.lastActivity = this.now();
  }
  accept(event, acceptedText) {
    if (!activityTypes.has(event.type)) return false;
    if (event.type.startsWith('transcript.') && event.payload?.role && event.payload.role !== 'user') return false;
    if (!Number.isSafeInteger(event.seq) || event.seq < 0 || typeof event.turnId !== 'string'
        || !event.turnId.trim() || event.turnId.length > 256) {
      // Without ordering/correlation, keep the call open rather than guessing.
      this.blocked = true; return false;
    }
    if (event.seq <= this.sequence) return false;
    this.sequence = event.seq;
    this.lastActivity = this.now();
    const command = acceptedText && event.type === 'transcript.done'
      && standbyPhrase(event.payload?.text ?? event.payload?.transcript ?? event.payload?.delta);
    if (!this.turns.has(event.turnId)) {
      if (this.turns.size >= TURN_LIMIT) { this.blocked = true; return command; }
      this.turns.set(event.turnId, { ended: false });
    }
    const turn = this.turns.get(event.turnId);
    // A delayed transcript/final text must not reopen a response that ended.
    if (['turn.started', 'output.text.delta', 'output.audio.started', 'output.audio.delta'].includes(event.type)) turn.ended = false;
    if (event.type === 'turn.ended' || event.type === 'turn.cancelled') turn.ended = true;
    return command;
  }
  due() {
    return this.seconds > 0 && !this.blocked && this.lastActivity !== null
      && ![...this.turns.values()].some(turn => !turn.ended)
      && this.now() - this.lastActivity >= this.seconds * 1000;
  }
}
