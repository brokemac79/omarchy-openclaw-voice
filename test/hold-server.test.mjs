import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('actual daemon gates held input, preserves one call and honours both release settings without real audio/provider',
  { skip: process.platform === 'win32' }, async () => {
  for (const holdRelease of ['mute', 'end']) {
    const root = await mkdtemp(join(tmpdir(), 'voice-hold-server-'));
    let child, renewing;
    const request = (command = 'status', token) => new Promise((resolve, reject) => {
      const socket = net.connect(join(root, 'openclaw-voice/control.sock'), () => socket.write(JSON.stringify({ command, holdToken: token }) + '\n'));
      let data = '';
      socket.setTimeout(1500, () => socket.destroy(new Error('Synthetic control timed out')));
      socket.on('data', chunk => { data += chunk; }); socket.on('error', reject);
      socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    });
    const until = async predicate => {
      for (let i = 0; i < 100; i++) {
        try { const state = await request(); if (predicate(state)) return state; } catch {}
        await delay(25);
      }
      throw Error('Synthetic hold daemon did not reach expected state');
    };
    try {
      const sdk = join(root, 'sdk.mjs'), receipts = join(root, 'rpc.jsonl'), connection = join(root, 'connected');
      await writeFile(connection, 'yes');
      await writeFile(sdk, `import {readFile,appendFile} from 'node:fs/promises';
export class GatewayClient {
 constructor(opts){this.opts=opts;this.connected=false;this.id=null;}
 async start(){this.timer=setInterval(async()=>{
  const connected=(await readFile(process.env.FAKE_CONNECTED,'utf8'))==='yes';
  if(connected!==this.connected){this.connected=connected;if(connected)this.opts.onHelloOk({});else this.opts.onClose();}
  if(this.connected&&this.id){this.opts.onEvent({event:'talk.event',payload:{voiceSessionId:this.id,talkEvent:{type:'session.ready'}}});
   this.opts.onEvent({event:'talk.event',payload:{voiceSessionId:this.id,talkEvent:{type:'output.text.done',seq:++this.seq,payload:{text:'Synthetic reply continues.'}}}});}
 },30);}
 async stopAndWait(){clearInterval(this.timer);}
 async request(method,params){await appendFile(process.env.FAKE_RECEIPTS,JSON.stringify(method)+'\\n');
  if(method==='agents.list')return {agents:[{id:'main',name:'Synthetic main'}]};
  if(method==='node.list')return {nodes:[]};
  if(method==='sessions.resolve')return {ok:true,key:params.key,agentId:'main'};
  if(method==='sessions.list')return {sessions:[{key:params.search,agentId:'main'}]};
  if(method==='config.get')return {config:{auth:{profiles:{fixture:{provider:'openai',mode:'oauth'}}}}};
  if(method==='talk.catalog')return {realtime:{ready:true}};
  if(method==='talk.client.create'){this.id='synthetic-voice';this.seq=0;return {provider:'openai',transport:'webrtc',model:'gpt-live-1-codex',
   clientControl:{owner:'gateway'},offerUrl:'/plugins/openai/realtime/calls',voiceSessionId:this.id,clientSecret:'synthetic-grant'};}
  if(method==='talk.client.close'){this.id=null;return {};}
  throw Error('Unexpected synthetic request');
 }
}
export async function startGatewayClientWhenEventLoopReady(client){await client.start();}`);
      const python = join(root, 'fake-python');
      await writeFile(python, `#!/usr/bin/python3
import json,os,select,sys
assert sys.argv[1].endswith('/native/audio.py')
print('{"event":"ready","syntheticSilence":true}',flush=True)
started=False;muted=True;buffer=b''
while True:
 if select.select([sys.stdin],[],[],0.03)[0]:
  chunk=os.read(sys.stdin.fileno(),8192)
  if not chunk: break
  buffer+=chunk
  while b'\\n' in buffer:
   line,buffer=buffer.split(b'\\n',1);data=json.loads(line)
   if data['command']=='start':
    assert data['holdMode'] is True and data['muted'] is True
    started=True;muted=True
   elif data['command']=='hold-input': muted=data['enabled'] is not True
   elif data['command']=='quiet': pass
   else: raise SystemExit('Unexpected fake input command')
 if started: print(json.dumps({'event':'levels','active':True,'captureReady':True,'muted':muted,'outputMuted':False,'input':0,'output':0.2}),flush=True)
`, { mode: 0o700 });
      const config = join(root, 'config/openclaw-voice'); await mkdir(config, { recursive: true });
      const gateway = join(root, 'gateway.json'); await writeFile(gateway, '{}');
      await writeFile(join(config, 'config.json'), JSON.stringify({ openclawConfig: gateway, gatewaySdk: sdk, python, holdRelease }));
      child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
        env: { PATH: process.env.PATH, HOME: root, XDG_RUNTIME_DIR: root, XDG_CONFIG_HOME: join(root, 'config'),
          OPENCLAW_VOICE_TEST_SILENCE: '1', FAKE_CONNECTED: connection, FAKE_RECEIPTS: receipts }, stdio: 'pipe',
      });
      let output = ''; child.stderr.on('data', data => { output += data; }); child.stdout.resume();
      await until(state => state.connected && state.destination?.state === 'ready');
      const first = 'a'.repeat(16), second = 'b'.repeat(16), third = 'c'.repeat(16);
      assert.equal((await request('hold-release', first)).holdAccepted, true);
      assert.equal((await request('hold-start', first)).holdAccepted, false);
      assert.equal((await request('hold-start', second)).holdAccepted, true);
      renewing = setInterval(() => { void request('hold-renew', second).catch(() => {}); }, 150);
      await until(state => state.active && state.hold.ready);
      const countCreates = async () => (await readFile(receipts, 'utf8')).split('\n').filter(line => line === '"talk.client.create"').length;
      assert.equal(await countCreates(), 1);
      assert.equal((await request('select-audio-device')).audioSelectionChanged, false);
      assert.equal((await request('hold-release', second)).holdAccepted, true);
      clearInterval(renewing); renewing = null;
      if (holdRelease === 'end') {
        await until(state => !state.requested && state.status === 'idle');
        assert.equal((await request('hold-start', third)).holdAccepted, false);
        assert.equal((await request('toggle')).startFailure.code, 'mode_switch_blocked');
      } else {
        const released = await until(state => state.requested && state.inputMuted && !state.hold.held);
        assert.equal(released.status, 'input-muted'); assert.equal(released.hold.releaseBehavior, 'mute');
        assert.equal(released.lastResult, 'Synthetic reply continues.');
        assert.equal((await request('hold-start', third)).holdAccepted, true);
        await until(state => state.hold.ready);
        await until(state => state.inputMuted && !state.hold.held); // Missing renewal recovers automatically.
        assert.equal((await request('hold-renew', third)).holdAccepted, false);
        assert.equal(await countCreates(), 1);
        await writeFile(connection, 'no'); await until(state => !state.connected && !state.requested && !state.hold.held);
        await writeFile(connection, 'yes'); await until(state => state.connected);
        const reconnected = await request(); assert.equal(reconnected.requested, false); assert.equal(reconnected.hold.held, false);
      }
      assert.ok(!output.includes('synthetic-grant'));
    } finally {
      clearInterval(renewing);
      if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'close'); }
      await rm(root, { recursive: true, force: true });
    }
  }
});
