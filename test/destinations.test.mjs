import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Destinations, destinationPresets } from '../src/destinations.mjs';
import { EngineOwner } from '../src/engine-owner.mjs';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'voice-destination-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'private/destination.json');
  const data = { agents: [{ id: 'alpha', name: 'Synthetic Alpha' }, { id: 'beta', name: 'Synthetic Beta' }],
    nodes: [{ nodeId: 'fixture-node', displayName: 'Synthetic workstation', connected: true, paired: true }],
    sessions: [{ key: 'agent:alpha:main', agentId: 'alpha' }, { key: 'agent:beta:work', agentId: 'beta', execNode: 'fixture-node' }] };
  const calls = []; let now = 0, allowed = true;
  const rpc = async (method, params = {}) => {
    calls.push({ method, params });
    if (data.error) throw Error('synthetic-secret endpoint');
    if (method === 'agents.list') return { agents: data.agents };
    if (method === 'node.list') return { nodes: data.nodes };
    if (method === 'sessions.list') return { sessions: data.sessions.filter(row => row.key === params.search) };
    if (method === 'sessions.resolve') {
      const row = data.sessions.find(row => row.key === params.key);
      return row ? { ok: true, key: row.key, agentId: row.agentId } : { ok: false };
    }
    throw Error('Unexpected mutation or provider request');
  };
  const presets = destinationPresets({ sessionKey: 'agent:alpha:main',
    destinations: [{ id: 'work', label: 'Synthetic work context', sessionKey: 'agent:beta:work', nodeId: 'fixture-node' }] });
  const destinations = new Destinations({ presets, path, rpc, now: () => now, canSwitch: () => allowed, ...overrides });
  await destinations.load(); destinations.setConnected(true); await destinations.refresh();
  return { destinations, data, calls, path, presets, rpc, time: value => { now = value; }, allow: value => { allowed = value; } };
}

test('preset setup requires explicit canonical destinations and rejects duplicate or malformed routing', () => {
  for (const options of [{ sessionKey: 'main' }, { destinations: 'invalid' },
    { destinations: [{ label: 'Synthetic missing ID', sessionKey: 'agent:beta:main' }] },
    { destinations: [{ id: 'configured', label: 'Duplicate', sessionKey: 'agent:beta:main' }] },
    { destinations: [{ id: 'other', label: 'Duplicate', sessionKey: 'agent:main:main' }] },
    { destinations: [{ id: '../bad', label: 'Synthetic', sessionKey: 'agent:beta:main' }] },
    { destinations: [{ id: 'work', label: 'Synthetic', sessionKey: 'agent:beta:work', nodeId: 'not a node' }] }]) {
    assert.throws(() => destinationPresets(options));
  }
  assert.equal(destinationPresets()[0].sessionKey, 'agent:main:main');
});

test('choices resolve exact existing agents/sessions/nodes with read-only RPCs and no invented fallback', async t => {
  const f = await fixture(t); const state = f.destinations.snapshot();
  assert.equal(state.destination.state, 'ready'); assert.equal(state.destination.agent, 'Synthetic Alpha');
  assert.equal(state.destinationChoices[1].target, 'Synthetic workstation');
  assert.equal(await f.destinations.forCall(), 'agent:alpha:main');
  assert.ok(f.calls.every(call => ['agents.list', 'node.list', 'sessions.resolve', 'sessions.list'].includes(call.method)));
  assert.ok(!/sessionKey|nodeId|synthetic-secret/.test(JSON.stringify(state)));
  assert.ok(f.calls.filter(call => call.method === 'sessions.list').every(call => call.params.includeLastMessage === false));
});

test('missing/degraded agents, unknown sessions, archived rows and unavailable or mismatched nodes stay unavailable', async t => {
  const f = await fixture(t);
  for (const mutate of [() => { f.data.agents = f.data.agents.filter(agent => agent.id !== 'beta'); },
    () => { f.data.agents[1].status = 'degraded'; }, () => { f.data.sessions.pop(); },
    () => { f.data.sessions[1].archived = true; }, () => { f.data.nodes[0].connected = false; },
    () => { f.data.nodes[0].paired = false; }, () => { f.data.sessions[1].execNode = 'another-node'; }]) {
    f.data.agents = [{ id: 'alpha' }, { id: 'beta' }];
    f.data.sessions = [{ key: 'agent:alpha:main', agentId: 'alpha' }, { key: 'agent:beta:work', agentId: 'beta', execNode: 'fixture-node' }];
    f.data.nodes = [{ nodeId: 'fixture-node', connected: true, paired: true }];
    mutate(); await f.destinations.refresh();
    assert.equal(f.destinations.snapshot().destinationChoices[1].state, 'unavailable');
    await assert.rejects(f.destinations.select('work'), { code: 'destination_unavailable' });
    assert.equal(f.destinations.selectedId, 'configured');
  }
});

test('selection persists privately across restart; removed or edited presets never fall back to another agent', async t => {
  const f = await fixture(t); await f.destinations.select('work');
  assert.deepEqual(JSON.parse(await readFile(f.path)), { id: 'work', sessionKey: 'agent:beta:work', nodeId: 'fixture-node' });
  if (process.platform !== 'win32') assert.equal((await stat(f.path)).mode & 0o777, 0o600);
  const restored = new Destinations({ presets: f.presets, path: f.path, rpc: f.rpc });
  await restored.load(); restored.setConnected(true); await restored.refresh();
  assert.equal(await restored.forCall(), 'agent:beta:work');
  const removed = new Destinations({ presets: f.presets.slice(0, 1), path: f.path, rpc: f.rpc });
  await removed.load(); removed.setConnected(true); await removed.refresh();
  await assert.rejects(removed.forCall(), { code: 'destination_unavailable' });
  assert.equal(removed.selectedId, 'work');
  f.data.sessions[1].execNode = undefined;
  await restored.refresh(); await assert.rejects(restored.forCall(), { code: 'destination_unavailable' });
});

test('corrupt saved selection requires an explicit choice instead of selecting the default agent', async t => {
  const f = await fixture(t); await mkdir(join(f.path, '..'), { recursive: true }); await writeFile(f.path, '{');
  const restored = new Destinations({ presets: f.presets, path: f.path, rpc: f.rpc });
  await restored.load(); restored.setConnected(true); await restored.refresh();
  assert.equal(restored.snapshot().destination.state, 'unavailable');
  await assert.rejects(restored.forCall(), { code: 'destination_unavailable' });
  await restored.select('configured'); assert.equal(await restored.forCall(), 'agent:alpha:main');
});

test('stale or failed discovery cannot start a call, and late results after disconnect are ignored', async t => {
  const f = await fixture(t); f.time(45001);
  assert.equal(f.destinations.snapshot().destination.state, 'stale');
  f.data.error = true;
  await assert.rejects(f.destinations.forCall(), { code: 'destination_unavailable' });
  assert.ok(!JSON.stringify(f.destinations.snapshot()).includes('synthetic-secret'));
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  f.destinations.rpc = async method => { await gate; return method === 'agents.list' ? { agents: f.data.agents } : { nodes: f.data.nodes }; };
  const refresh = f.destinations.refresh(); f.destinations.setConnected(false);
  finish(); await refresh;
  assert.equal(f.destinations.snapshot().destination.state, 'stale');
  assert.equal(f.destinations.checkedAt, null);
});

test('selection is locked through active work, settlement and persistence; write failure keeps the old destination', async t => {
  const f = await fixture(t); f.allow(false);
  await assert.rejects(f.destinations.select('work'), { code: 'destination_switch_blocked' });
  f.allow(true); let finish;
  f.destinations.save = () => new Promise(resolve => { finish = resolve; });
  const selecting = f.destinations.select('work');
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.destinations.forCall(), { code: 'destination_unavailable' });
  await assert.rejects(f.destinations.select('configured'), { code: 'destination_switch_blocked' });
  finish(); await selecting;
  assert.equal(f.destinations.selectedId, 'work');
  f.destinations.save = async () => { throw Error('Synthetic disk failure'); };
  await assert.rejects(f.destinations.select('configured'));
  assert.equal(f.destinations.selectedId, 'work');
});

test('a node binding changed during selection persistence is unavailable until explicitly reviewed again', async t => {
  const f = await fixture(t); let finish;
  f.destinations.save = () => new Promise(resolve => { finish = resolve; });
  const selecting = f.destinations.select('configured');
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  f.data.sessions[0].execNode = 'fixture-node'; await f.destinations.refresh();
  finish(); await selecting;
  assert.equal(f.destinations.snapshot().destination.state, 'unavailable');
  await assert.rejects(f.destinations.forCall(), { code: 'destination_unavailable' });
});

test('a changed execution binding ends the call and requires review plus explicit reselection', async t => {
  let invalidated = 0;
  const f = await fixture(t, { onInvalidated: () => { invalidated++; } });
  await f.destinations.forCall();
  f.data.sessions[0].execNode = 'fixture-node'; await f.destinations.refresh();
  assert.equal(invalidated, 1); assert.equal(f.destinations.snapshot().destination.state, 'unavailable');
  f.destinations.endCall(); await assert.rejects(f.destinations.forCall(), { code: 'destination_unavailable' });
  await f.destinations.select('configured'); assert.equal(await f.destinations.forCall(), 'agent:alpha:main');
});

test('lost discovery invalidates standby too, even before a Talk call has acquired a binding', async t => {
  let invalidated = 0;
  const f = await fixture(t, { onInvalidated: () => { invalidated++; } });
  assert.equal(f.destinations.callBinding, null);
  f.data.agents = []; await f.destinations.refresh(); assert.equal(invalidated, 1);
  f.data.error = true; await f.destinations.refresh(); assert.equal(invalidated, 2);
});

test('result review is an explicit boundary; ending voice alone cannot enable a silent agent switch', async () => {
  const owner = new EngineOwner({ session: { close: async () => {} }, native: { set() {}, levels() {} },
    launch: async () => ({ start: async () => {}, close: async () => {} }) });
  await owner.start(); owner.dismissResult(); assert.equal(owner.reviewRequired, true);
  owner.talk({ type: 'output.text.done', seq: 1, payload: { text: 'Synthetic pending answer.' } });
  await owner.stop(); assert.equal(owner.reviewRequired, true);
  assert.equal(owner.lastResult, 'Synthetic pending answer.');
  owner.dismissResult(); assert.equal(owner.reviewRequired, false); assert.equal(owner.lastResult, '');
});
