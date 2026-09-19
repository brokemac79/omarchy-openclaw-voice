import { mkdir, chmod, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { level } from './policy.mjs';

export async function createState(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  let state = { status: 'idle', text: 'Microphone off' }, levels = [0, 0], running = false;
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
      // No audio files or transcript history; only the latest caption in runtime memory.
      const text = levels.join(' ');
      if (text !== lastLevels) { await atomic('level', text); lastLevels = text; }
    } finally { running = false; }
  }
  await flush();
  const timer = setInterval(() => { void flush().catch(() => {}); }, 80);
  return {
    get: () => ({ ...state }),
    set(status, text) {
      const caption = String(text || '').slice(0, 240);
      if (state.status !== status || state.text !== caption) {
        state = { status, text: caption }; dirty = true;
      }
    },
    levels(input, output) { levels = [level(input), level(output)]; },
    async close() {
      clearInterval(timer);
      while (running) await new Promise(r => setTimeout(r, 10));
      state = { status: 'idle', text: 'Microphone off' }; levels = [0, 0]; dirty = true;
      await flush(); closed = true;
    },
  };
}
