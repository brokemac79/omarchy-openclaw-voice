import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AudioDevices, discoverAudio, deviceId } from '../src/audio-devices.mjs';
import { EngineOwner } from '../src/engine-owner.mjs';

const inventory = () => ({ input: [{ name: 'fixture-mic-a', label: 'Same microphone' }, { name: 'fixture-mic-b', label: 'Same microphone' }],
  output: [{ name: 'fixture-speaker', label: 'Synthetic speaker' }], defaults: { input: 'fixture-mic-a', output: 'fixture-speaker' } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  let data = inventory(), time = 0, idle = true, started = 0, closed = 0, invalidated = 0, callbacks;
  const device = new AudioDevices({ path: '/unused/synthetic-audio.json', discover: async () => structuredClone(data),
    now: () => time, canUse: () => idle, save: async () => {},
    launch: async value => { started++; callbacks = value; return { close: async () => { closed++; } }; },
    onInvalidated: () => { invalidated++; }, ...options });
  return { device, data: () => data, setData: value => { data = value; }, clock: value => { time = value; },
    idle: value => { idle = value; }, started: () => started, closed: () => closed,
    invalidated: () => invalidated, callbacks: () => callbacks };
}

test('discovery is bounded read-only pactl JSON and excludes monitor capture', async () => {
  const calls = [];
  const data = await discoverAudio({ run: async (file, args, options) => {
    calls.push({ file, args, options });
    return { stdout: JSON.stringify(args.at(-1) === 'sources' ? [
      { name: 'fixture-mic', description: 'Synthetic microphone', monitor_of_sink: null },
      { name: 'fixture-monitor', description: 'Monitor', monitor_of_sink: 1 }] : args.at(-1) === 'sinks'
      ? [{ name: 'fixture-speaker', description: 'Speaker' }] : { default_source_name: 'fixture-mic', default_sink_name: 'fixture-speaker' }) };
  } });
  assert.equal(data.input.length, 1); assert.equal(data.defaults.input, 'fixture-mic');
  assert.ok(calls.every(call => call.file === 'pactl' && call.args[0] === '--format=json' && call.options.timeout === 2000));
  assert.ok(calls.every(call => !call.args.some(arg => /set-|load-|move-|play-/.test(arg))));
  await assert.rejects(discoverAudio({ run: async () => ({ stdout: 'not json' }) }));
});

test('selection distinguishes duplicate labels, persists routing preferences only and never opens audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-device-prefs-'));
  try {
    const path = join(directory, 'audio.json');
    const f = fixture({ path, save: undefined });
    // Use the real private writer for this persistence test.
    const { saveDestination } = await import('../src/destinations.mjs'); f.device.save = saveDestination;
    await f.device.load(); await f.device.refresh();
    const rows = f.device.snapshot().inputs;
    assert.equal(rows[1].label, rows[2].label); assert.notEqual(rows[1].id, rows[2].id); assert.notEqual(rows[1].detail, rows[2].detail);
    await f.device.select('input', rows[2].id);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(saved, { version: 1, input: 'fixture-mic-b', output: null });
    const next = fixture({ path }); await next.device.load(); await next.device.refresh();
    assert.equal(next.device.snapshot().inputId, rows[2].id); assert.equal(next.started(), 0);
    if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing/default devices and stale or failed discovery never fall back or start a check', async () => {
  const f = fixture({ inputDevice: 'fixture-missing' }); await f.device.refresh();
  assert.equal(f.device.snapshot().inputAvailable, false);
  await assert.rejects(f.device.forVoice(), error => error.code === 'audio_device_unavailable');
  f.data().defaults.output = 'fixture-missing'; await f.device.refresh();
  await f.device.startCheck('speaker'); assert.equal(f.started(), 0);
  assert.match(f.device.message, /unavailable/);
  f.clock(11000); assert.equal(f.device.snapshot().state, 'stale');
  f.device.discover = async () => { throw Error('synthetic private failure'); };
  await f.device.refresh(); assert.ok(!f.device.message.includes('private'));
  assert.equal(f.started(), 0);
});

test('voice/standby ownership blocks changes and tone; a tone blocks voice and selection', async () => {
  const f = fixture(); await f.device.refresh(); f.idle(false);
  await assert.rejects(f.device.select('input', 'default'), error => error.code === 'audio_busy');
  await assert.rejects(f.device.startCheck('speaker'), error => error.code === 'audio_busy');
  f.idle(true); await f.device.startCheck('speaker');
  assert.equal(f.device.snapshot().check.phase, 'checking');
  assert.deepEqual(f.device.binding, { output: 'fixture-speaker' });
  await assert.rejects(f.device.forVoice(), error => error.code === 'audio_busy');
  await assert.rejects(f.device.select('input', 'default'), error => error.code === 'audio_busy');
  await f.device.stopCheck(); assert.equal(f.closed(), 1); assert.equal(f.device.occupied, false);
  await f.device.stopCheck(); assert.equal(f.closed(), 1);
  await assert.rejects(f.device.startCheck('microphone'), error => error.code === 'audio_selection_invalid');
});

test('tone expiry, disappearance and default changes release output without restarting it', async () => {
  for (const reason of ['expiry', 'unplug', 'default', 'stale', 'error']) {
    const f = fixture(); await f.device.startCheck('speaker');
    if (reason === 'expiry') { f.clock(2100); f.device.tick(); }
    if (reason === 'unplug') { f.data().output = []; await f.device.refresh(); }
    if (reason === 'default') { f.data().defaults.output = 'other'; await f.device.refresh(); }
    if (reason === 'stale') { f.clock(11000); f.device.tick(); }
    if (reason === 'error') f.callbacks().onFailure();
    await tick(); await f.device.cleanup;
    assert.equal(f.closed(), 1, reason); assert.equal(f.started(), 1, reason);
    assert.equal(f.device.occupied, false, reason);
    await f.device.refresh(); assert.equal(f.started(), 1);
  }
});

test('Stop during acquisition aborts and waits for late worker release before another owner can start', async () => {
  let release, options, closed = 0;
  const f = fixture({ launch: value => { options = value; return new Promise(resolve => { release = resolve; }); } });
  const starting = f.device.startCheck('speaker'); await tick();
  const stopping = f.device.stopCheck(); assert.equal(options.signal.aborted, true);
  assert.equal(f.device.occupied, true);
  await assert.rejects(f.device.forVoice(), error => error.code === 'audio_busy');
  release({ close: async () => { closed++; } });
  await Promise.all([starting, stopping]); assert.equal(closed, 1); assert.equal(f.device.occupied, false);
});

test('changed or stale voice bindings invalidate the existing owner without choosing a replacement', async () => {
  const f = fixture(); const bound = await f.device.forVoice();
  assert.equal(bound.inputDevice, 'fixture-mic-a');
  f.data().defaults.input = 'fixture-mic-b'; await f.device.refresh();
  assert.equal(f.invalidated(), 1); assert.equal(f.device.binding, null);
  await f.device.forVoice(true); assert.deepEqual(f.device.binding, { input: 'fixture-mic-b' });
  f.clock(11000); f.device.tick(); assert.equal(f.invalidated(), 2); assert.equal(f.started(), 0);
});

test('a failed late-worker release keeps audio blocked after startup cancellation', async () => {
  let release;
  const f = fixture({ launch: () => new Promise(resolve => { release = resolve; }) });
  const starting = f.device.startCheck('speaker'); await tick();
  const stopping = f.device.stopCheck();
  release({ close: async () => { throw Error('synthetic release failure'); } });
  await Promise.all([starting, stopping]);
  assert.equal(f.device.snapshot().releaseUnconfirmed, true);
  await assert.rejects(f.device.forVoice(), error => error.code === 'audio_busy');
});

test('corrupt saved preferences require both explicit choices and cannot be repaired by restarting midway', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-device-corrupt-'));
  try {
    const path = join(directory, 'audio.json'); await writeFile(path, '{broken');
    const { saveDestination } = await import('../src/destinations.mjs');
    const f = fixture({ path, save: saveDestination }); await f.device.load(); await f.device.refresh();
    assert.equal(f.device.snapshot().inputAvailable, false);
    await f.device.select('input', 'default');
    assert.equal(f.device.snapshot().outputAvailable, false);
    assert.equal(await readFile(path, 'utf8'), '{broken');
    const restarted = fixture({ path }); await restarted.device.load(); await restarted.device.refresh();
    assert.equal(restarted.device.snapshot().inputAvailable, false);
    await f.device.select('output', 'default'); assert.equal(f.device.snapshot().outputAvailable, true);
    const repaired = fixture({ path }); await repaired.device.load(); await repaired.device.refresh();
    assert.equal(repaired.device.snapshot().inputAvailable, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('failed persistence keeps the old preference and unconfirmed release blocks all new audio', async () => {
  const f = fixture({ save: async () => { throw Error('synthetic write failure'); } });
  await f.device.refresh(); await assert.rejects(f.device.select('input', deviceId('fixture-mic-b')));
  assert.equal(f.device.preferences.input, null); assert.equal(f.device.occupied, false);
  f.device.launch = async () => ({ close: async () => { throw Error('synthetic release failure'); } });
  await f.device.startCheck('speaker'); await f.device.stopCheck();
  assert.equal(f.device.snapshot().releaseUnconfirmed, true);
  await assert.rejects(f.device.forVoice(), error => error.code === 'audio_busy');
});

test('wake startup preserves actionable audio selection failures before acquiring a detector', async () => {
  const f = fixture({ inputDevice: 'fixture-missing' });
  const owner = new EngineOwner({ session: { close: async () => {} }, native: { set() {}, levels() {} },
    launchWake: async () => { await f.device.forVoice(true); throw Error('Detector must not be reached'); } });
  await owner.arm('conversation');
  assert.equal(owner.failure.code, 'audio_device_unavailable');
  assert.equal(owner.standby, false); assert.equal(owner.requested, false);
});
