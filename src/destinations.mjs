import { readFile, mkdir, chmod, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { VoiceError } from './voice-errors.mjs';
import { monotonicNow } from './readiness.mjs';

const idPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const keyPattern = /^agent:([a-z0-9][a-z0-9_-]{0,63}):[^\s\x00-\x1f\x7f]{1,192}$/;
const label = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 64) : '';
const nodeId = value => typeof value === 'string' && value.length <= 256 && !/[\s\x00-\x1f\x7f]/.test(value) ? value : null;

export function destinationPresets(options = {}) {
  if (options.destinations !== undefined && (!Array.isArray(options.destinations) || options.destinations.length > 7)) {
    throw new Error('Configure at most seven additional destinations.');
  }
  const presets = [{ id: 'configured', label: options.destinationLabel || 'Configured conversation',
    sessionKey: options.sessionKey || 'agent:main:main' }, ...(options.destinations || [])];
  const ids = new Set(), keys = new Set();
  for (const preset of presets) {
    if (!preset || typeof preset.id !== 'string' || !idPattern.test(preset.id) || !keyPattern.test(preset.sessionKey)
      || !label(preset.label) || preset.label.length > 64 || ids.has(preset.id) || keys.has(preset.sessionKey)
      || (preset.nodeId !== undefined && !nodeId(preset.nodeId))) throw new Error('Invalid or duplicate destination preset.');
    ids.add(preset.id); keys.add(preset.sessionKey);
  }
  return presets.map(preset => ({ id: preset.id, label: label(preset.label), sessionKey: preset.sessionKey,
    agentId: preset.sessionKey.match(keyPattern)[1], nodeId: preset.nodeId }));
}

export async function saveDestination(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw new Error('Invalid selection directory.');
  await chmod(directory, 0o700);
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export class Destinations {
  constructor({ presets, path, rpc, canSwitch = () => true, settle = async () => {},
    onChange = () => {}, onInvalidated = () => {}, now = monotonicNow, save = saveDestination }) {
    Object.assign(this, { presets, path, rpc, canSwitch, settle, onChange, onInvalidated, now, save });
    this.selectedId = 'configured'; this.saved = null; this.switching = false;
    this.connected = false; this.checkedAt = null; this.epoch = 0; this.pending = null;
    this.choices = presets.map(preset => ({ ...preset, agent: preset.agentId, target: 'Unverified execution context', state: 'unavailable', binding: null }));
    this.callBinding = null; this.reselect = false;
  }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.path, 'utf8'));
      if (typeof saved.id !== 'string' || !idPattern.test(saved.id) || !keyPattern.test(saved.sessionKey)
        || (saved.nodeId !== null && !nodeId(saved.nodeId))) throw new Error('Invalid saved destination.');
      this.selectedId = saved.id; this.saved = saved;
    } catch (error) {
      if (error.code !== 'ENOENT') { this.selectedId = null; this.reselect = true; }
    }
  }
  setConnected(value) {
    this.connected = value === true; this.epoch++;
    this.checkedAt = null; this.pending = null;
    this.onChange();
    if (value) void this.refresh();
  }
  selected() { return this.choices.find(choice => choice.id === this.selectedId); }
  snapshot() {
    const current = this.selected();
    const fresh = this.connected && this.checkedAt !== null && this.now() - this.checkedAt < 45000;
    const state = !fresh ? 'stale' : this.reselect ? 'unavailable' : current?.state || 'unavailable';
    const present = choice => ({ id: choice.id, label: choice.label, agent: choice.agent, target: choice.target,
      state: fresh ? choice.state : 'stale' });
    return { destination: { id: this.selectedId, label: current?.label || 'Saved destination unavailable',
      agent: current?.agent || '', target: current?.target || '', state,
      message: !fresh ? 'Destination discovery is stale. Refresh before speaking.'
        : this.reselect ? 'Destination changed. Review results, then explicitly select a destination.'
          : current?.state !== 'ready' ? 'Configured destination is unavailable. Check its agent, session and node.' : '',
      canSwitch: !this.switching && this.canSwitch(), switching: this.switching },
    destinationChoices: this.choices.map(present) };
  }
  async discover(preset, agents, nodes) {
    const item = { ...preset, agent: preset.agentId, target: 'Gateway-selected execution', state: 'unavailable', binding: null };
    const agent = agents.find(candidate => candidate.id === preset.agentId);
    if (!agent || agent.status === 'degraded' || agent.admissionRefusal) return item;
    item.agent = label(agent.name || agent.identity?.name) || preset.agentId;
    try {
      const [resolved, catalog] = await Promise.all([
        this.rpc('sessions.resolve', { key: preset.sessionKey, allowMissing: true }),
        this.rpc('sessions.list', { agentId: preset.agentId, search: preset.sessionKey, limit: 50,
          rowMode: 'compact', includeDerivedTitles: false, includeLastMessage: false }),
      ]);
      if (resolved?.ok !== true || resolved.key !== preset.sessionKey || resolved.agentId !== preset.agentId) return item;
      const row = catalog?.sessions?.find(candidate => candidate.key === preset.sessionKey);
      if (!row || row.archived || (row.agentId && row.agentId !== preset.agentId)) return item;
      const boundNode = row.execNode === undefined || row.execNode === null || row.execNode === '' ? null : nodeId(row.execNode);
      if ((row.execNode && !boundNode) || (preset.nodeId && preset.nodeId !== boundNode)) return item;
      if (boundNode) {
        const node = nodes.find(candidate => candidate.nodeId === boundNode);
        item.target = label(node?.displayName) || 'Configured node';
        if (!node || node.connected !== true || node.paired === false) return item;
      } else if (preset.nodeId) return item;
      item.state = 'ready'; item.binding = { id: preset.id, sessionKey: preset.sessionKey, nodeId: boundNode };
      return item;
    } catch { return item; }
  }
  refresh() {
    if (this.pending) return this.pending;
    if (!this.connected) return Promise.resolve();
    const epoch = this.epoch;
    const work = (async () => {
      try {
        const [catalog, nodes] = await Promise.all([this.rpc('agents.list'), this.rpc('node.list').catch(() => null)]);
        if (!Array.isArray(catalog?.agents)) throw new Error('Invalid agent catalog.');
        const choices = await Promise.all(this.presets.map(preset => this.discover(preset, catalog.agents, nodes?.nodes || [])));
        if (epoch !== this.epoch) return;
        this.choices = choices; this.checkedAt = this.now();
        const current = this.selected();
        if (this.saved && current?.state === 'ready' && JSON.stringify(current.binding) !== JSON.stringify(this.saved)) this.reselect = true;
        if (current?.state !== 'ready' || (this.callBinding && JSON.stringify(current.binding) !== JSON.stringify(this.callBinding))) {
          if (this.callBinding && current?.state === 'ready') this.reselect = true;
          this.onInvalidated();
        }
      } catch {
        if (epoch !== this.epoch) return;
        this.checkedAt = null;
        this.onInvalidated();
      } finally { if (epoch === this.epoch) this.onChange(); }
    })();
    this.pending = work.finally(() => { if (epoch === this.epoch) this.pending = null; });
    return this.pending;
  }
  async forCall() {
    if (this.switching) throw new VoiceError('destination_unavailable');
    await this.refresh();
    if (this.snapshot().destination.state !== 'ready') throw new VoiceError('destination_unavailable');
    this.callBinding = { ...this.selected().binding };
    return this.callBinding.sessionKey;
  }
  endCall() { this.callBinding = null; }
  async select(id) {
    if (typeof id !== 'string' || !idPattern.test(id) || this.switching || !this.canSwitch()) throw new VoiceError('destination_switch_blocked');
    this.switching = true; this.onChange();
    try {
      await this.settle(); await this.refresh();
      if (!this.canSwitch() || !this.connected) throw new VoiceError('destination_switch_blocked');
      const choice = this.choices.find(candidate => candidate.id === id);
      if (choice?.state !== 'ready' || this.checkedAt === null) throw new VoiceError('destination_unavailable');
      const binding = { ...choice.binding }, epoch = this.epoch;
      await this.save(this.path, binding);
      // A disconnected or replaced catalog cannot authorize starting a call.
      this.selectedId = id; this.saved = binding;
      this.reselect = JSON.stringify(this.selected()?.binding) !== JSON.stringify(binding);
      this.callBinding = null;
      if (epoch !== this.epoch) this.checkedAt = null;
    } finally { this.switching = false; this.onChange(); }
  }
}
