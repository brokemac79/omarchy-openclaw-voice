import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { saveDestination } from './destinations.mjs';
import { monotonicNow } from './readiness.mjs';
import { VoiceError } from './voice-errors.mjs';

const execute = promisify(execFile);
const kinds = ['input', 'output'];
const validName = value => typeof value === 'string' && /^[^\s\x00-\x1f\x7f]{1,512}$/.test(value);
const label = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 96);
export const deviceId = name => createHash('sha256').update(name).digest('hex').slice(0, 16);

// Read-only discovery. Never change the desktop's defaults or open audio.
export async function discoverAudio({ run = execute } = {}) {
  const read = async args => JSON.parse((await run('pactl', ['--format=json', ...args],
    { timeout: 2000, maxBuffer: 262144, encoding: 'utf8', env: Object.fromEntries(
      ['PATH', 'HOME', 'XDG_RUNTIME_DIR', 'PULSE_SERVER', 'PULSE_COOKIE', 'LANG']
        .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])) })).stdout);
  const [sources, sinks, info] = await Promise.all([read(['list', 'sources']), read(['list', 'sinks']), read(['info'])]);
  const devices = rows => {
    if (!Array.isArray(rows) || rows.length > 64) throw new Error('Audio inventory unavailable.');
    const names = new Set();
    return rows.map(row => {
      if (!validName(row?.name) || names.has(row.name)) throw new Error('Invalid audio inventory.');
      names.add(row.name);
      return { name: row.name, label: label(row.description) || row.name.slice(0, 96) };
    });
  };
  if (!Array.isArray(sources)) throw new Error('Invalid audio inventory.');
  return { input: devices(sources.filter(row => row.monitor_of_sink == null
      || row.monitor_of_sink === 4294967295 || row.monitor_of_sink === 'n/a')),
    output: devices(sinks), defaults: { input: info.default_source_name, output: info.default_sink_name } };
}

export class AudioDevices {
  constructor({ path, inputDevice, outputDevice, discover = discoverAudio, launch,
    canUse = () => true, settle = async () => {}, onChange = () => {}, onInvalidated = () => {},
    now = monotonicNow, save = saveDestination }) {
    Object.assign(this, { path, discover, launch, canUse, settle, onChange, onInvalidated, now, save });
    this.preferences = { input: inputDevice ?? null, output: outputDevice ?? null };
    this.inventory = { input: [], output: [], defaults: {} };
    this.checkedAt = null; this.pending = null; this.operation = 'idle';
    this.invalid = kinds.filter(kind => this.preferences[kind] !== null && !validName(this.preferences[kind]));
    this.binding = null; this.check = null; this.epoch = 0;
    this.message = ''; this.discoveryMessage = 'Refresh audio devices before use.'; this.releaseFault = false;
    this.pendingCheck = Promise.resolve(); this.cleanup = Promise.resolve();
  }
  get occupied() { return this.operation !== 'idle' || this.releaseFault; }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'));
      if (saved.version !== 1 || kinds.some(kind => saved[kind] !== null && !validName(saved[kind]))) throw Error('Invalid device selection');
      this.preferences = { input: saved.input, output: saved.output }; this.invalid = [];
    } catch (error) {
      if (error.code !== 'ENOENT') { this.invalid = [...kinds]; this.message = 'Saved audio selection is invalid. Select both devices again.'; }
    }
  }
  fresh() { return this.checkedAt !== null && this.now() - this.checkedAt < 10000; }
  resolved(kind) {
    if (!this.fresh() || this.invalid.includes(kind)) return null;
    const name = this.preferences[kind] === null ? this.inventory.defaults[kind] : this.preferences[kind];
    return this.inventory[kind].find(row => row.name === name) || null;
  }
  validateBinding() {
    if (this.binding && Object.entries(this.binding).some(([kind, name]) => this.resolved(kind)?.name !== name)) {
      this.binding = null;
      if (this.operation === 'checking' || this.operation === 'starting') void this.stopCheck('Audio device changed or disappeared. Start the check again explicitly.');
      this.onInvalidated();
    }
  }
  refresh() {
    if (this.pending) return this.pending;
    const work = (async () => {
      try {
        const inventory = await this.discover();
        for (const kind of kinds) {
          if (!Array.isArray(inventory[kind]) || inventory[kind].length > 64
              || inventory[kind].some(row => !validName(row.name) || typeof row.label !== 'string')) throw Error('Invalid audio inventory');
        }
        this.inventory = inventory; this.checkedAt = this.now();
        this.discoveryMessage = this.invalid.length ? 'Saved audio selection is invalid. Select both devices again.' : '';
      } catch {
        this.checkedAt = null; this.discoveryMessage = 'Audio discovery unavailable. Check PipeWire/PulseAudio and refresh.';
      }
      this.validateBinding(); this.onChange();
    })();
    this.pending = work;
    void work.finally(() => { if (this.pending === work) this.pending = null; });
    return work;
  }
  snapshot() {
    const fresh = this.fresh();
    const choices = kind => [{ id: 'default', label: 'System default', detail: label(this.inventory.defaults[kind]),
      available: fresh && this.inventory[kind].some(row => row.name === this.inventory.defaults[kind]) },
    ...this.inventory[kind].map(row => ({ id: deviceId(row.name), label: label(row.label), detail: row.name, available: fresh })),
    ...(validName(this.preferences[kind]) && !this.inventory[kind].some(row => row.name === this.preferences[kind])
      ? [{ id: deviceId(this.preferences[kind]), label: 'Saved device unavailable', detail: this.preferences[kind], available: false }] : [])];
    return { state: fresh ? 'ready' : 'stale', message: this.releaseFault ? 'Audio release unconfirmed. Stop the companion service.' : this.message || this.discoveryMessage,
      canSelect: this.canUse() && !this.occupied, occupied: this.occupied, releaseUnconfirmed: this.releaseFault,
      inputs: choices('input'), outputs: choices('output'),
      inputId: this.preferences.input === null ? 'default' : validName(this.preferences.input) ? deviceId(this.preferences.input) : '',
      outputId: this.preferences.output === null ? 'default' : validName(this.preferences.output) ? deviceId(this.preferences.output) : '',
      inputAvailable: !!this.resolved('input'), outputAvailable: !!this.resolved('output'),
      check: { phase: this.operation, mode: this.mode || '',
        remainingMs: this.deadline ? Math.max(0, Math.round(this.deadline - this.now())) : 0 } };
  }
  async select(kind, id) {
    if (!kinds.includes(kind) || !/^(default|[a-f0-9]{16})$/.test(id || '')) throw new VoiceError('audio_selection_invalid');
    if (!this.canUse() || this.occupied) throw new VoiceError('audio_busy');
    this.operation = 'selecting'; this.onChange();
    try {
      await this.settle(); await this.refresh();
      const row = id === 'default' ? null : this.inventory[kind].find(row => deviceId(row.name) === id);
      if (!this.fresh() || (id !== 'default' && !row)
          || (id === 'default' && !this.inventory[kind].some(value => value.name === this.inventory.defaults[kind]))) throw new VoiceError('audio_device_unavailable');
      const next = { ...this.preferences, [kind]: row?.name ?? null };
      // A corrupt counterpart must be explicitly reselected before use. Save a
      // valid counterpart only; an unsuccessful write never changes selection.
      const invalid = this.invalid.filter(value => value !== kind);
      if (!invalid.length) await this.save(this.path, { version: 1, ...next });
      this.preferences = next; this.invalid = invalid;
      this.message = invalid.length ? 'Select the other audio device to finish repairing saved preferences.' : '';
      this.binding = null;
    } finally { this.operation = 'idle'; this.onChange(); }
  }
  async forVoice(inputOnly = false) {
    if (this.occupied) throw new VoiceError('audio_busy');
    await this.refresh();
    if (this.occupied) throw new VoiceError('audio_busy');
    const input = this.resolved('input'), output = inputOnly ? null : this.resolved('output');
    if (!input || (!inputOnly && !output)) throw new VoiceError('audio_device_unavailable');
    this.binding = { input: input.name, ...(!inputOnly ? { output: output.name } : {}) };
    return { inputDevice: input.name, outputDevice: output?.name };
  }
  async startCheck(mode) {
    if (mode !== 'speaker') throw new VoiceError('audio_selection_invalid');
    if (!this.canUse() || this.occupied) throw new VoiceError('audio_busy');
    const epoch = ++this.epoch;
    this.aborter = new AbortController();
    this.operation = 'starting'; this.mode = mode; this.message = '';
    this.deadline = this.now() + 2000; this.onChange();
    const pending = (async () => {
      await this.cleanup; await this.settle(); await this.refresh();
      if (epoch !== this.epoch) return;
      const kind = 'output', row = this.resolved(kind);
      if (!row) throw new VoiceError('audio_device_unavailable');
      this.binding = { [kind]: row.name };
      const candidate = await this.launch({ mode, device: row.name, signal: this.aborter.signal,
        onEnd: () => { if (epoch === this.epoch) void this.stopCheck(); },
        onFailure: () => { if (epoch === this.epoch) void this.stopCheck('Local audio check failed. Review the selected device and try again.'); } });
      if (epoch !== this.epoch) {
        try { await candidate.close(); } catch { this.releaseFault = true; }
        return;
      }
      this.check = candidate; this.operation = 'checking'; this.onChange();
    })();
    this.pendingCheck = pending;
    try { await pending; }
    catch { if (epoch === this.epoch) await this.stopCheck('Local audio check unavailable. Check the selected device and native dependencies.'); }
  }
  async stopCheck(message = '') {
    // Closing the panel must never cancel Talk or wake capture.
    if (!['starting', 'checking', 'stopping'].includes(this.operation)) return;
    ++this.epoch; this.aborter?.abort(); this.operation = 'stopping'; this.onChange();
    const old = this.check; this.check = null;
    const pending = this.pendingCheck;
    this.cleanup = Promise.all([this.cleanup, old?.close(), pending.catch(() => {})]).catch(() => { this.releaseFault = true; });
    await this.cleanup;
    this.binding = null; this.deadline = null; this.mode = ''; this.message = message;
    this.operation = 'idle'; this.onChange();
  }
  tick() {
    this.validateBinding();
    if (['starting', 'checking'].includes(this.operation) && this.deadline !== null && this.now() >= this.deadline) void this.stopCheck();
  }
}
