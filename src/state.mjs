import { mkdir, chmod, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { level } from './policy.mjs';
import { TRANSCRIPT_LIMIT } from './transcript.mjs';

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
        startupStage: typeof controls.startupStage === 'string' ? controls.startupStage.slice(0, 40) : null,
        errorCode: typeof controls.errorCode === 'string' ? controls.errorCode.slice(0, 40) : null,
        recoveryAction: String(controls.recoveryAction || '').slice(0, 240),
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
