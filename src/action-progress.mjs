// These are observations of the current Talk route, not host execution states.
// Provider turns and tool events have no qualified host-run completion binding.
export const ACTION_CARD_LIMIT = 4;
const TURN_LIMIT = 32;
const responseTypes = new Set(['output.text.delta', 'output.text.done', 'output.audio.started',
  'turn.ended', 'turn.cancelled', 'tool.call', 'tool.progress', 'tool.result', 'tool.error']);

export class ActionProgress {
  constructor() { this.clear(); }
  clear() {
    this.turns = new Map(); this.cards = []; this.sequence = -1;
    this.nextNumber = 1; this.earlierUnknown = 0; this.untracked = false;
  }
  accept(event) {
    const heard = event.type === 'transcript.done' && (!event.payload?.role || event.payload.role === 'user')
      && typeof event.payload?.text === 'string' && event.payload.text.trim().length > 0;
    if (!heard && !responseTypes.has(event.type)) return;
    // Do not guess turn association from text, arrival order or a shared session.
    if (typeof event.turnId !== 'string' || !event.turnId.trim() || event.turnId.length > 256
      || !Number.isSafeInteger(event.seq) || event.seq < 0 || event.seq <= this.sequence) return;
    this.sequence = event.seq;
    let turn = this.turns.get(event.turnId);
    if (!turn) {
      // Freeze correlation when the bounded ledger fills. Evicting identities
      // could make a late transcript appear to be a new request.
      if (this.turns.size >= TURN_LIMIT) { this.untracked = true; return; }
      turn = { responded: false, card: null };
      this.turns.set(event.turnId, turn);
    }
    if (heard && !turn.card) {
      const card = { number: this.nextNumber++, status: turn.responded ? 'unknown' : 'heard' };
      turn.card = card; this.cards.push(card);
      if (this.cards.length > ACTION_CARD_LIMIT) { this.cards.shift(); this.earlierUnknown++; }
    } else if (!heard) {
      turn.responded = true;
      if (turn.card) turn.card.status = 'unknown';
    }
  }
  end() { for (const card of this.cards) card.status = 'unknown'; }
  dismiss() { this.cards = []; this.earlierUnknown = 0; this.untracked = false; }
  snapshot() {
    return { actionCards: this.cards.map(card => ({ ...card })), earlierUnknown: this.earlierUnknown,
      additionalUnknown: this.untracked };
  }
}
