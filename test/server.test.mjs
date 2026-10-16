import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('real servers isolate controls and clear hello metadata without starting audio', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-server-'));
  const children = [];
  const request = (path, command = 'status') => new Promise((resolve, reject) => {
    const socket = net.connect(path, () => socket.write(JSON.stringify({ command }) + '\n'));
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
        async start() { let last=''; this.timer=setInterval(async()=>{
          const event=await readFile(process.env.FAKE_EVENT,'utf8'); if(event===last)return; last=event;
          const data=JSON.parse(event);
          if(data.type==='close')this.opts.onClose();
          else if(data.type==='error')this.opts.onConnectError(Error('synthetic-secret'));
          else this.opts.onHelloOk(data);
        },20); }
        async stopAndWait(){clearInterval(this.timer);}
        request(){throw Error('No provider or agent calls allowed in this test');}
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
        python: detector, wake: { enabled: name === 'test' } }));
      const event = join(root, `${name}.json`); events.push(event);
      await writeFile(event, JSON.stringify({ auth: { method: 'device-token', role: 'operator', deviceToken: 'synthetic-secret' }, server: { connId: name } }));
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
    assert.equal((await request(sockets[1], 'standby-once')).ok, false);
    assert.equal((await request(sockets[0], 'standby-conversation')).ok, false);
    assert.equal((await request(sockets[1], 'standby-conversation')).ok, true);
    const standby = await until(sockets[1], state => state.standby);
    assert.equal(standby.status, 'standby'); assert.equal(standby.active, false);
    await request(sockets[1], 'mute');
    await until(sockets[1], state => state.status === 'idle');
    assert.equal((await request(sockets[1])).wakeMode, 'off');
    for (const type of ['close', 'error']) {
      await request(sockets[1], 'standby-conversation'); await until(sockets[1], state => state.standby);
      await writeFile(events[1], JSON.stringify({ type }));
      const closed = await until(sockets[1], state => !state.connected);
      assert.equal(closed.gatewayConnection, null);
      assert.equal(closed.standby, false); assert.equal(closed.wakeMode, 'off');
      assert.equal((await request(sockets[0])).connected, true);
      await writeFile(events[1], JSON.stringify({ auth: { method: 'token' }, server: { connId: type } }));
      const next = await until(sockets[1], state => state.connected);
      assert.equal(next.gatewayConnection.authMethod, 'token');
      assert.equal(next.gatewayConnection.connId, type);
      assert.equal(next.standby, false); assert.equal(next.wakeMode, 'off');
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
