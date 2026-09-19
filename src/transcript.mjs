// Talk delta payloads contain fragments, even when the field is named `text`.
// Done payloads replace those fragments with the finalized utterance.
export const TRANSCRIPT_LIMIT = 1800;

export class Transcript {
  constructor() { this.clear(); }
  clear() {
    this.user = this.assistant = '';
    this.lastSequence = -1;
    this.current = { user: {}, assistant: {} };
  }
  accept(event) {
    const role = event.type?.startsWith('transcript.') ? 'user'
      : event.type?.startsWith('output.text.') ? 'assistant' : null;
    if (!role || !/\.(delta|done)$/.test(event.type)) return false;
    const payload = event.payload || {};
    if (role === 'user' && payload.role && payload.role !== 'user') return false;
    const text = payload.text ?? payload.transcript ?? payload.delta;
    if (typeof text !== 'string' || !text) return false;
    if (Number.isSafeInteger(event.seq)) {
      if (event.seq <= this.lastSequence) return false;
      this.lastSequence = event.seq;
    }
    const previous = this.current[role], done = event.type.endsWith('.done');
    const changedItem = event.itemId && previous.item && event.itemId !== previous.item;
    const changedTurn = event.turnId && previous.turn && event.turnId !== previous.turn;
    const newUtterance = !previous.seen || changedItem || changedTurn || (previous.done && !done);
    if (newUtterance) {
      this[role] = '';
      // Transcription can lag behind a reply. Keep assistant text that has
      // already arrived for this exchange, including before the first input.
      const replyTurn = this.current.assistant.turn;
      const sameReplyTurn = event.turnId && replyTurn === event.turnId;
      const lateFirstInput = !previous.seen && (!event.turnId || !replyTurn || sameReplyTurn);
      const replyAlreadyInNewTurn = sameReplyTurn && previous.turn !== event.turnId;
      if (role === 'user' && !lateFirstInput && !replyAlreadyInNewTurn) {
        this.assistant = '';
        this.current.assistant = {};
      }
    }
    this[role] = (done ? text : this[role] + text).slice(-TRANSCRIPT_LIMIT);
    this.current[role] = { seen: true, done, item: event.itemId, turn: event.turnId };
    return true;
  }
  get() { return { user: this.user, assistant: this.assistant }; }
}
