import { mkdir, chmod, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { level } from './policy.mjs';
import { TRANSCRIPT_LIMIT, answerPrefix } from './transcript.mjs';
import { ACTION_CARD_LIMIT } from './action-progress.mjs';

export async function createState(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const idle = () => ({ status: 'idle', text: 'Microphone off', user: '', assistant: '' });
  let state = idle(), levels = [0, 0], running = false;
  let closed = false, dirty = true, lastWritten = 0, lastLevels = '';
  async function atomic(name, text) {
    await writeFile(join(directory, name + '.tmp'), text, { mode: 0o600 });
    await rename(join(directory, name + '.tmp'), join(directory, name));
  }
  async function flush() {
    if (running || closed) return;
    running = true;
    try {
      if (dirty || Date.now() - lastWritten > 5000) {
        dirty = false; lastWritten = Date.now();
        await atomic('state.json', JSON.stringify({ ...state, updated: Date.now() / 1000 }));
      }
      // No audio files or transcript history; only the current exchange in tmpfs.
      const text = levels.join(' ');
      if (text !== lastLevels) { await atomic('level', text); lastLevels = text; }
    } finally { running = false; }
  }
  await flush();
  const timer = setInterval(() => { void flush().catch(() => {}); }, 80);
  return {
    get: () => ({ ...state }),
    set(status, text, transcript = {}, controls = {}) {
      const caption = String(text || '').slice(0, 240);
      const active = ['listening', 'thinking', 'acting', 'confirm'].includes(status);
      const user = active ? String(transcript.user || '').slice(-TRANSCRIPT_LIMIT) : '';
      const assistant = active ? String(transcript.assistant || '').slice(-TRANSCRIPT_LIMIT) : '';
      const next = { status, text: caption, user, assistant,
        callRequested: controls.callRequested === true,
        inputMuted: controls.inputMuted === true, inputMuteRequested: controls.inputMuteRequested === true,
        speechQuiet: controls.speechQuiet === true, speechQuietRequested: controls.speechQuietRequested === true,
        workStatus: 'unknown', cancelAvailable: false,
        reviewRequired: controls.reviewRequired === true,
        destination: controls.destination ? {
          id: String(controls.destination.id || '').slice(0, 32),
          label: String(controls.destination.label || '').slice(0, 64),
          agent: String(controls.destination.agent || '').slice(0, 64),
          target: String(controls.destination.target || '').slice(0, 64),
          state: ['ready', 'unavailable', 'stale'].includes(controls.destination.state) ? controls.destination.state : 'stale',
          message: String(controls.destination.message || '').slice(0, 240),
          canSwitch: controls.destination.canSwitch === true, switching: controls.destination.switching === true,
        } : null,
        destinationChoices: Array.isArray(controls.destinationChoices) ? controls.destinationChoices.slice(0, 8).map(choice => ({
          id: String(choice.id || '').slice(0, 32), label: String(choice.label || '').slice(0, 64),
          agent: String(choice.agent || '').slice(0, 64), target: String(choice.target || '').slice(0, 64),
          state: ['ready', 'unavailable', 'stale'].includes(choice.state) ? choice.state : 'stale',
        })) : [],
        actionCards: Array.isArray(controls.actionCards) ? controls.actionCards.slice(-ACTION_CARD_LIMIT)
          .filter(card => Number.isSafeInteger(card?.number) && card.number > 0)
          .map(card => ({ number: card.number, status: card.status === 'heard' ? 'heard' : 'unknown' })) : [],
        earlierUnknown: Number.isSafeInteger(controls.earlierUnknown) && controls.earlierUnknown > 0 ? controls.earlierUnknown : 0,
        additionalUnknown: controls.additionalUnknown === true,
        startupStage: typeof controls.startupStage === 'string' ? controls.startupStage.slice(0, 40) : null,
        errorCode: typeof controls.errorCode === 'string' ? controls.errorCode.slice(0, 40) : null,
        recoveryAction: String(controls.recoveryAction || '').slice(0, 240),
        answer: { text: answerPrefix(controls.answer?.text),
          truncated: controls.answer?.truncated === true
            || answerPrefix(controls.answer?.text).length < String(controls.answer?.text || '').length,
          complete: controls.answer?.complete === true },
        lastResult: String(controls.lastResult || '').slice(-TRANSCRIPT_LIMIT) };
      if (JSON.stringify(state) !== JSON.stringify(next)) {
        state = next; dirty = true;
      }
    },
    levels(input, output) { levels = [level(input), level(output)]; },
    async close() {
      clearInterval(timer);
      while (running) await new Promise(r => setTimeout(r, 10));
      state = idle(); levels = [0, 0]; dirty = true;
      await flush(); closed = true;
    },
  };
}
