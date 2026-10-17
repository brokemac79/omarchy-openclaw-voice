import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('daemon SIGTERM waits for a cancelled late worker to be released before exiting',
  { skip: process.platform === 'win32', timeout: 10000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'voice-shutdown-'));
    let child, workerPid;
    const receipt = join(root, 'released'), pidFile = join(root, 'worker.pid');
    const request = (command = 'status') => new Promise((resolve, reject) => {
      const socket = net.connect(join(root, 'openclaw-voice/control.sock'),
        () => socket.write(JSON.stringify({ command }) + '\n'));
      let data = ''; socket.setTimeout(2000, () => socket.destroy(new Error('Synthetic control timeout')));
      socket.on('error', reject); socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    });
    const until = async predicate => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        try { if (await predicate()) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      throw new Error('Synthetic shutdown fixture did not reach its expected state');
    };
    try {
      const sdk = join(root, 'sdk.mjs');
      await writeFile(sdk, `export class GatewayClient {
        constructor(options){this.options=options;}
        start(){this.options.onHelloOk({auth:{method:'device-token'}});}
        async stopAndWait(){}
        async request(method,params={}){
          if(method==='agents.list')return {agents:[{id:'main'}]};
          if(method==='node.list')return {nodes:[]};
          if(method==='sessions.resolve')return {ok:true,key:params.key,agentId:'main'};
          if(method==='sessions.list')return {sessions:[{key:params.search,agentId:'main'}]};
          throw Error('No provider session is allowed in this shutdown fixture');
        }
      } export async function startGatewayClientWhenEventLoopReady(client){await client.start();}`);
      const python = join(root, 'fake-python');
      await writeFile(python, `#!/usr/bin/python3
import json,os,signal,sys,time
from pathlib import Path
assert sys.argv[1].endswith('/native/audio.py') and '--synthetic-silence' in sys.argv
def stop(*_args):
 Path(${JSON.stringify(receipt)}).write_text('released');sys.exit(0)
signal.signal(signal.SIGTERM,stop)
Path(${JSON.stringify(pidFile)}).write_text(str(os.getpid()))
time.sleep(.4)
try: print(json.dumps({'event':'ready','syntheticSilence':True}),flush=True)
except BrokenPipeError: pass
while True: time.sleep(.1)
`, { mode: 0o700 });
      const directory = join(root, 'config/openclaw-voice'); await mkdir(directory, { recursive: true });
      const gateway = join(root, 'gateway.json'); await writeFile(gateway, '{}');
      await writeFile(join(directory, 'config.json'), JSON.stringify({ openclawConfig: gateway, gatewaySdk: sdk, python }));
      child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
        env: { PATH: process.env.PATH, HOME: root, XDG_RUNTIME_DIR: root,
          XDG_CONFIG_HOME: join(root, 'config'), OPENCLAW_VOICE_TEST_SILENCE: '1' }, stdio: 'ignore',
      });
      await until(async () => (await request()).destination?.state === 'ready');
      assert.equal((await request('toggle')).requested, true);
      await until(async () => { workerPid = Number(await readFile(pidFile, 'utf8')); return workerPid > 0; });
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const [code, signal] = await exited;
      assert.equal(code, 0); assert.equal(signal, null);
      assert.equal(await readFile(receipt, 'utf8').catch(() => ''), 'released',
        'Daemon exited before its cancelled native worker confirmed release');
      assert.throws(() => process.kill(workerPid, 0), { code: 'ESRCH' });
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
      if (workerPid) { try { process.kill(workerPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      await rm(root, { recursive: true, force: true });
    }
  });
