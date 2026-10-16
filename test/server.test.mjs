import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('real servers isolate controls and clear hello metadata without starting audio', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-server-'));
  const children = [];
  const publishEvent = async (path, event) => {
    // The fake SDK polls this file. Never expose writeFile's truncated window.
    await writeFile(path + '.tmp', JSON.stringify(event));
    await rename(path + '.tmp', path);
  };
  const request = (path, command = 'status', fields = {}) => new Promise((resolve, reject) => {
    const socket = net.connect(path, () => socket.write(JSON.stringify({ command, ...fields }) + '\n'));
    let data = '';
    socket.setTimeout(1000, () => socket.destroy(new Error('test timeout')));
    socket.on('data', chunk => { data += chunk; }); socket.on('error', reject);
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
  });
  const until = async (path, predicate) => {
    for (let i = 0; i < 100; i++) {
      try { const state = await request(path); if (predicate(state)) return state; } catch {}
      await new Promise(r => setTimeout(r, 25));
    }
    throw new Error('Server did not reach expected state');
  };
  try {
    const sdk = join(root, 'sdk.mjs');
    await writeFile(sdk, `import {readFile} from 'node:fs/promises';
      export class GatewayClient {
        constructor(opts) { this.opts=opts; if(opts.mode!=='ui') throw Error('Expected UI pairing'); }
        async start() { let last='', reading=false; this.timer=setInterval(async()=>{
          if(reading)return; reading=true;
          try {
          const event=await readFile(process.env.FAKE_EVENT,'utf8'); if(event===last)return;
          const data=JSON.parse(event); last=event;
          if(data.type==='close')this.opts.onClose();
          else if(data.type==='error')this.opts.onConnectError(Object.assign(Error('synthetic-secret'),{details:{code:data.code}}));
          else this.opts.onHelloOk(data);
          } finally { reading=false; }
        },20); }
        async stopAndWait(){clearInterval(this.timer);}
        async request(method,params){
          if(method==='agents.list') return {agents:[{id:'main',name:'Synthetic main'},{id:'secondary',name:'Synthetic secondary'}]};
          if(method==='node.list') return {nodes:[]};
          if(method==='sessions.resolve') return {ok:true,key:params.key,agentId:params.key.split(':')[1]};
          if(method==='sessions.list') return {sessions:[{key:params.search,agentId:params.agentId}]};
          throw Error('No provider or agent calls allowed in this test');
        }
      }
      export async function startGatewayClientWhenEventLoopReady(client){await client.start();}`);
    const config = join(root, 'gateway.json');
    const detector = join(root, 'fake-python');
    const detectorReceipt = join(root, 'detector-starts');
    await writeFile(detector, `#!/usr/bin/python3
import json, pathlib, select, sys
if not sys.argv[1].endswith('/native/wake.py'): raise SystemExit('No Talk worker allowed')
settings = json.loads(sys.stdin.readline())
if 'gateway' in json.dumps(settings) or 'synthetic-secret' in json.dumps(settings): raise SystemExit('Unexpected credentials')
with pathlib.Path(${JSON.stringify(detectorReceipt)}).open('a') as receipt: receipt.write('start\\n')
print('{"event":"ready"}', flush=True)
while not select.select([sys.stdin], [], [], 0.1)[0]: print('{"event":"heartbeat"}', flush=True)
`, { mode: 0o700 });
    await writeFile(config, JSON.stringify({ gateway: { mode: 'remote', remote: { url: 'ws://127.0.0.1:29789' } } }));
    const sockets = [], events = [];
    for (const name of ['default', 'test']) {
      const base = name === 'default' ? 'openclaw-voice' : 'openclaw-voice-test';
      const options = join(root, 'config', base); await mkdir(options, { recursive: true });
      await writeFile(join(options, 'config.json'), JSON.stringify({ openclawConfig: config, gatewaySdk: sdk,
        python: detector, wake: { enabled: name === 'test' },
        destinations: [{id:'secondary',label:'Synthetic secondary context',sessionKey:'agent:secondary:main'}] }));
      const event = join(root, `${name}.json`); events.push(event);
      await publishEvent(event, { auth: { method: 'device-token', role: 'operator', deviceToken: 'synthetic-secret' }, server: { connId: name } });
      const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
        env: { PATH: process.env.PATH, HOME: root, XDG_RUNTIME_DIR: root, XDG_CONFIG_HOME: join(root, 'config'),
          OPENCLAW_VOICE_INSTANCE: name, FAKE_EVENT: event }, stdio: 'pipe',
      });
      children.push(child); let output = '';
      child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      const socket = join(root, base, 'control.sock'); sockets.push(socket);
      const state = await until(socket, state => state.connected);
      assert.equal(state.instance, name); assert.equal(state.gatewayConnection.connId, name);
      assert.equal(state.active, false); assert.equal(state.requested, false);
      assert.equal(state.standby, false); assert.equal(state.wakeMode, 'off');
      assert.equal(state.gatewaySdk.path, sdk);
      assert.ok(!JSON.stringify(state).includes('synthetic-secret'));
      assert.ok(!output.includes('synthetic-secret'));
    }
    for (const command of ['quiet', 'resume-speech', 'dismiss-result']) {
      const state = await request(sockets[1], command);
      assert.equal(state.ok, true); assert.equal(state.requested, false); assert.equal(state.active, false);
    }
    await until(sockets[1], state => state.destination?.state === 'ready');
    const destinations = await request(sockets[1], 'destinations');
    assert.equal(destinations.destinationChoices.length, 2);
    assert.equal((await request(sockets[1], 'select-destination', {destinationId:'secondary'})).selectionChanged, true);
    assert.equal((await request(sockets[1])).destination.agent, 'Synthetic secondary');
    assert.equal((await request(sockets[0])).destination.id, 'configured');
    assert.equal((await request(sockets[1], 'select-destination', {destinationId:'missing'})).selectionChanged, false);
    assert.equal((await request(sockets[1])).destination.id, 'secondary');
    assert.equal(JSON.parse(await readFile(join(root,'config/openclaw-voice-test/destination.json'))).sessionKey, 'agent:secondary:main');
    const cancellation = await request(sockets[1], 'cancel-request');
    assert.equal(cancellation.cancellation.outcome, 'unavailable');
    assert.equal(cancellation.workStatus, 'unknown');
    const diagnostics = await request(sockets[1], 'diagnostics');
    assert.equal(diagnostics.ready, false); assert.equal(diagnostics.gatewayConnected, true);
    assert.equal(diagnostics.agentWorkMs, null);
    assert.ok(!/synthetic-secret|assistant|gatewayConnection|test-build|voiceSessionId|destination|Synthetic secondary/.test(JSON.stringify(diagnostics)));
    await assert.rejects(readFile(detectorReceipt), { code: 'ENOENT' });
    assert.equal((await request(sockets[1], 'standby-once')).ok, false);
    assert.equal((await request(sockets[0], 'standby-conversation')).ok, false);
    assert.equal((await request(sockets[1], 'standby-conversation')).ok, true);
    const standby = await until(sockets[1], state => state.standby);
    assert.equal(standby.status, 'standby'); assert.equal(standby.active, false);
    assert.equal((await request(sockets[1], 'select-destination', {destinationId:'configured'})).selectionChanged, false);
    assert.equal((await request(sockets[1])).standby, true);
    assert.equal((await request(sockets[1], 'quiet')).standby, true);
    assert.equal((await request(sockets[1], 'cancel-request')).standby, true);
    await request(sockets[1], 'mute');
    await until(sockets[1], state => state.status === 'idle');
    assert.equal((await request(sockets[1])).wakeMode, 'off');
    for (const type of ['close', 'error']) {
      await request(sockets[1], 'standby-conversation'); await until(sockets[1], state => state.standby);
      await publishEvent(events[1], { type, code: type === 'error' ? 'PAIRING_REQUIRED' : undefined });
      const closed = await until(sockets[1], state => !state.connected);
      assert.equal(closed.gatewayConnection, null);
      assert.equal(closed.standby, false); assert.equal(closed.wakeMode, 'off');
      assert.equal(closed.errorCode, type === 'error' ? 'pairing_required' : 'gateway_disconnected');
      assert.ok(!JSON.stringify(closed.diagnostics).includes('synthetic-secret'));
      assert.equal((await request(sockets[0])).connected, true);
      await publishEvent(events[1], { auth: { method: 'token' }, server: { connId: type } });
      const next = await until(sockets[1], state => state.connected && state.errorCode === null);
      assert.equal(next.gatewayConnection.authMethod, 'token');
      assert.equal(next.gatewayConnection.connId, type);
      assert.equal(next.standby, false); assert.equal(next.wakeMode, 'off');
      await until(sockets[1], state => state.destination?.state === 'ready');
      assert.equal((await request(sockets[1])).destination.id, 'secondary');
    }
  } finally {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      try { await exited; } finally { clearTimeout(timer); }
    }));
    await rm(root, { recursive: true, force: true });
  }
});
