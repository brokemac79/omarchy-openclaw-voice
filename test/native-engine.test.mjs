import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createServer } from 'node:http';
import { launchEngine, readSdpAnswer, MAX_SDP_BYTES } from '../src/native-engine.mjs';
const tick = () => new Promise(r => setImmediate(r));
function fixture() {
  const child = new EventEmitter(), commands = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(data, _, cb) { commands.push(JSON.parse(data)); cb(); } });
  child.kill = () => { queueMicrotask(() => child.emit('close', 0)); };
  let args;
  const spawnWorker = (_, a) => { args = a; queueMicrotask(() => child.stdout.write('{"event":"ready","syntheticSilence":true}\n')); return child; };
  const session = { grant: { clientSecret: 'synthetic', voiceSessionId: 'test' }, create: async () => {} };
  const config = { python: 'synthetic-python', gatewayUrl: 'wss://example.com' };
  return { child, commands, session, config, spawnWorker, args: () => args };
}
test('synthetic mode is explicit and startup mute cannot be lost while reserving a session', async () => {
  const f = fixture(); let finish;
  f.session.create = () => new Promise(r => { finish = r; });
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true });
  const starting = engine.start(); engine.mute(true); finish(); await starting;
  assert.ok(f.args().includes('--synthetic-silence'));
  assert.equal(f.commands[0].muted, true);
  assert.equal(f.commands[0].command, 'start'); await engine.close();
});
test('stop during grant acquisition never starts the native pipeline', async () => {
  const f = fixture(); let finish;
  f.session.create = () => new Promise(r => { finish = r; });
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true });
  const starting = engine.start(); await engine.close(); finish(); await starting;
  assert.equal(f.commands.length, 0);
});
test('late SDP response after stop cannot reach a replacement worker', async () => {
  const f = fixture(); let finish, signal;
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true,
    exchange: async (url, options) => {
      assert.equal(url, 'https://example.com/plugins/openai/realtime/calls');
      signal = options.signal; return new Promise(r => { finish = r; });
    } });
  await engine.start(); f.child.stdout.write(JSON.stringify({ event: 'offer', sdp: 'v=0\r\nm=audio test' }) + '\n');
  await tick(); await engine.close(); assert.equal(signal.aborted, true);
  finish(new Response('v=0 synthetic answer')); await tick();
  assert.equal(f.commands.filter(c => c.command === 'answer').length, 0);
});

test('SDP bound accepts exactly 128 KiB of UTF-8 bytes across arbitrary chunks', async () => {
  const bytes = new TextEncoder().encode('é'.repeat(MAX_SDP_BYTES / 2));
  let offset = 0;
  const body = new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const end = Math.min(offset + 997, bytes.length);
    controller.enqueue(bytes.slice(offset, end)); offset = end;
  } });
  const answer = await readSdpAnswer(new Response(body), new AbortController().signal);
  assert.equal(answer, 'é'.repeat(MAX_SDP_BYTES / 2));
  assert.equal(body.locked, false);
});

for (const chunkSize of [1, 8192, MAX_SDP_BYTES + 1]) {
  test(`unending SDP stream is cancelled at overflow (chunk size ${chunkSize})`, async () => {
    let pulls = 0, cancelled = false;
    const body = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(chunkSize)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    await assert.rejects(readSdpAnswer(new Response(body), new AbortController().signal), /131072 bytes/);
    assert.equal(pulls, Math.floor(MAX_SDP_BYTES / chunkSize) + 1);
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  });
}

test('an SDP body that stops sending bytes obeys cancellation and releases the reader', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const aborter = new AbortController();
  const reading = readSdpAnswer(new Response(body), aborter.signal);
  aborter.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(cancelled, true); assert.equal(body.locked, false);
});

test('stop during streaming exchange cancels the body without delivering an answer or failure', async () => {
  const f = fixture(); let cancelled = false, failures = 0;
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('v=0'));
  }, cancel() { cancelled = true; } });
  const engine = await launchEngine(f.config, f.session, {
    spawnWorker: f.spawnWorker, syntheticSilence: true,
    exchange: async () => new Response(body), onFailure: () => failures++,
  });
  await engine.start();
  f.child.stdout.write(JSON.stringify({ event: 'offer', sdp: 'v=0\r\nm=audio test' }) + '\n');
  await tick(); await engine.close(); await tick();
  assert.equal(cancelled, true); assert.equal(body.locked, false);
  assert.equal(f.commands.filter(c => c.command === 'answer').length, 0);
  assert.equal(failures, 0);
});

test('deadline cancels a silent body even when its source ignores the fetch signal', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  // Keep the loop alive because AbortSignal.timeout uses an unreferenced timer.
  const keepAlive = setInterval(() => {}, 50);
  try {
    await assert.rejects(readSdpAnswer(new Response(body), AbortSignal.timeout(15)), { name: 'TimeoutError' });
    assert.equal(cancelled, true); assert.equal(body.locked, false);
  } finally { clearInterval(keepAlive); }
});
test('unexpected worker exit reports failure once; shutdown does not report another', async () => {
  const f = fixture(); let failed = 0;
  const engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true, onFailure: () => failed++ });
  f.child.emit('exit', 1); f.child.emit('error', new Error('synthetic'));
  assert.equal(failed, 1); await engine.close(); assert.equal(failed, 1);
});
test('spawn failure closes promptly instead of waiting for a nonexistent exit event', async () => {
  const f = fixture();
  const spawnWorker = () => { queueMicrotask(() => { f.child.emit('error', new Error('ENOENT')); f.child.emit('close', -1); }); return f.child; };
  await assert.rejects(launchEngine(f.config, f.session, { spawnWorker }));
});

test('a local gateway receives the SDP offer over loopback HTTP with only the session credential', { timeout: 5000 }, async () => {
  const f = fixture();
  let request;
  const server = createServer((req, res) => {
    request = { method: req.method, url: req.url, authorization: req.headers.authorization, body: '' };
    req.on('data', chunk => { request.body += chunk; });
    req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/sdp' }); res.end('v=0 synthetic answer'); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  f.config.gatewayUrl = `ws://127.0.0.1:${server.address().port}`;
  f.config.gatewayAuth = { token: 'synthetic-gateway-token' };
  let engine;
  try {
    engine = await launchEngine(f.config, f.session, { spawnWorker: f.spawnWorker, syntheticSilence: true });
    await engine.start();
    f.child.stdout.write(JSON.stringify({ event: 'offer', sdp: 'v=0\r\nm=audio synthetic' }) + '\n');
    const deadline = Date.now() + 2000;
    while (!f.commands.some(c => c.command === 'answer') && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.deepEqual(request, { method: 'POST', url: '/plugins/openai/realtime/calls',
      authorization: 'Bearer synthetic', body: 'v=0\r\nm=audio synthetic' });
    assert.equal(f.commands.find(c => c.command === 'answer')?.sdp, 'v=0 synthetic answer');
  } finally {
    await engine?.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
