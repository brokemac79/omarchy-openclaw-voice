import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { createState } from './state.mjs';
import { launchEngine } from './browser.mjs';
import { VoiceSession } from './session.mjs';
import { MODEL, OFFER_PATH, isAuthorized } from './policy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = await loadConfig();
// Explicit live-test mode can only replace capture with silence and mute playback.
const syntheticSilence = process.env.ANT_VOICE_TEST_SILENCE === '1';
if (!process.env.XDG_RUNTIME_DIR) throw new Error('Run inside your Linux user session.');
const runtime = join(process.env.XDG_RUNTIME_DIR, 'ant-voice');
const native = await createState(runtime);
const key = randomBytes(32).toString('hex');
const origin = `http://127.0.0.1:${config.port}`;
let connected = false, desired = false, epoch = 0, engine = null, eventStream = null, shuttingDown = false;
let active = false, muted = false, engineStarting = false;
let cleanup = Promise.resolve();
const publish = (event, data = {}) => eventStream?.write(`data: ${JSON.stringify({ event, data })}\n\n`);
const status = () => ({ connected, requested: desired, active, muted, engineStarting, syntheticSilence, model: MODEL, ...native.get() });
const { GatewayClient, startGatewayClientWhenEventLoopReady } = await import(pathToFileURL(config.sdk));
const client = new GatewayClient({
  url: config.gatewayUrl, deviceAuthScope: config.gatewayUrl,
  clientName: 'gateway-client', clientDisplayName: 'Ant Voice', clientVersion: '0.2.0', mode: 'backend',
  scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals'],
  minProtocol: 4, maxProtocol: 4,
  onHelloOk: () => { connected = true; if (!desired) native.set('idle', 'Microphone off'); },
  onConnectError: () => { connected = false; if (!shuttingDown) void stop('Gateway connection unavailable.'); },
  onClose: () => { connected = false; if (!shuttingDown) void stop(desired ? 'Gateway disconnected. Microphone off.' : undefined); },
  onEvent: event => {
    if (event.event !== 'talk.event' || !session.grant || event.payload?.voiceSessionId !== session.grant.voiceSessionId) return;
    const talk = event.payload.talkEvent;
    if (!talk) return;
    if (!['input.audio.delta', 'output.audio.delta'].includes(talk.type)) publish('talk', talk);
    if (talk.type === 'session.error') void stop('Voice session ended with an error.');
    else if (talk.type === 'session.closed') void stop();
  },
});
const rpc = (method, params = {}) => {
  if (!connected) return Promise.reject(new Error('Gateway unavailable. Check your connection.'));
  return client.request(method, params, { timeoutMs: 15000 });
};
const session = new VoiceSession(rpc, config.sessionKey, config.voice);

async function stop(message) {
  epoch++; desired = active = muted = false;
  publish('stop'); native.levels(0, 0);
  native.set(message ? 'error' : 'idle', message || 'Microphone off');
  const old = engine; engine = null;
  // Close media immediately; do not wait for a network timeout to release the microphone.
  cleanup = Promise.allSettled([session.close(), old?.close(), cleanup]);
  await cleanup;
}
async function start() {
  if (!connected) throw new Error('Gateway unavailable. Check your connection.');
  if (engineStarting) throw new Error('The previous voice startup is still finishing.');
  desired = true; const current = ++epoch; engineStarting = true;
  native.set('thinking', 'Connecting to Ant');
  try {
    await cleanup;
    await session.preflight();
    if (current !== epoch || !desired) return;
    const candidate = await launchEngine(config, origin, key, message => { if (current === epoch) void stop(message); }, { syntheticSilence });
    if (current !== epoch || !desired) { await candidate.close(); return; }
    engine = candidate;
    publish('start');
  } catch (error) {
    if (current === epoch) await stop('Could not start voice. Check OAuth, the gateway and audio devices.');
    throw error;
  } finally { engineStarting = false; }
}
async function body(req, limit = 131072) {
  let length = 0; const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (req.headers.host !== new URL(origin).host) return json(res, 403, { error: 'Invalid host.' });
  const path = new URL(req.url, origin).pathname;
  try {
    if (req.method === 'GET' && ['/engine/', '/engine/app.js'].includes(path)) {
      const file = path.endsWith('.js') ? 'app.js' : 'index.html';
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' });
      return res.end(await readFile(join(root, 'engine', file)));
    }
    if (!isAuthorized(req, key, origin)) return json(res, 403, { error: 'Use the Ant Voice launcher.' });
    if (req.method === 'GET' && path === '/status') return json(res, 200, status());
    if (req.method === 'GET' && path === '/preflight') return json(res, 200, await session.preflight());
    if (req.method === 'GET' && path === '/events') {
      if (eventStream) return json(res, 409, { error: 'An audio engine is already connected.' });
      eventStream = res;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      publish('status', status());
      req.on('close', () => {
        if (eventStream === res) eventStream = null;
        if (desired && !shuttingDown) void stop('Audio engine disconnected. Microphone off.');
      });
      return;
    }
    if (req.method !== 'POST') return json(res, 404, { error: 'Unknown operation.' });
    if (path === '/toggle') {
      if (desired) await stop();
      else if (!connected) throw new Error('Gateway unavailable. Check your connection.');
      else void start().catch(() => {});
      return json(res, 200, status());
    }
    if (path === '/stop') { await stop(); return json(res, 200, status()); }
    if (path === '/mute') { if (desired) publish('mute'); return json(res, 200, { ok: true }); }
    if (path === '/engine-error') {
      // Deliberately avoid logging arbitrary provider messages, transcripts or credentials.
      await stop('Voice audio failed. Check microphone, speakers and gateway Talk diagnostics.');
      return json(res, 200, { ok: true });
    }
    if (path === '/telemetry') {
      const data = JSON.parse(await body(req, 8192));
      if (desired) {
        active = data.active === true; muted = data.muted === true;
        const state = ['listening', 'thinking', 'acting', 'confirm'].includes(data.state) ? data.state : 'thinking';
        native.set(state, typeof data.caption === 'string' ? data.caption : 'Ant Voice');
        native.levels(muted ? 0 : data.input, data.output);
      }
      return json(res, 200, { ok: true });
    }
    if (path === '/create') {
      if (!desired) throw new Error('Voice startup cancelled.');
      return json(res, 200, await session.create());
    }
    if (path === '/offer') {
      const grant = session.grant;
      if (!desired || !grant) throw new Error('No voice session is waiting for audio.');
      const sdp = await body(req);
      if (!sdp.startsWith('v=0') || !sdp.includes('m=audio') || sdp.includes('m=video') || sdp.includes('m=application')) throw new Error('Expected audio-only WebRTC.');
      const response = await fetch(config.gatewayUrl.replace(/^wss:/, 'https:') + OFFER_PATH, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${grant.clientSecret}`, 'Content-Type': 'application/sdp' }, body: sdp,
      });
      if (!response.ok) throw new Error('GPT-Live connection failed.');
      const answer = await response.text();
      if (!desired || session.grant !== grant) throw new Error('Voice startup cancelled.');
      res.writeHead(200, { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' }); return res.end(answer);
    }
    return json(res, 404, { error: 'Unknown operation.' });
  } catch (error) { return json(res, 400, { error: error.message?.slice(0, 240) || 'Voice request failed.' }); }
});
server.on('error', () => { void shutdown(1); });
server.listen(config.port, '127.0.0.1', async () => {
  await writeFile(join(runtime, 'connection.json'), JSON.stringify({ origin, key, pid: process.pid }), { mode: 0o600 });
});
await startGatewayClientWhenEventLoopReady(client);
setInterval(() => eventStream?.write(': keepalive\n\n'), 15000).unref();
async function shutdown(code = 0) {
  if (shuttingDown) return; shuttingDown = true;
  await stop(); await client.stopAndWait(); await native.close(); server.close(); process.exit(code);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
