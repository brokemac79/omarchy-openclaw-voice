import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test('actual daemon returns on user voice/idle, preserves answers and prevents overlapping input or disconnected rearming',
  { skip: process.platform === 'win32', timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-wake-return-'));
  let child, output = '';
  const request = command => new Promise((resolve, reject) => {
    const socket = net.connect(join(root, 'openclaw-voice/control.sock'), () => socket.write(JSON.stringify({ command }) + '\n'));
    let data = ''; socket.setTimeout(2500, () => socket.destroy(Error('Synthetic control timeout')));
    socket.on('data', chunk => { data += chunk; }); socket.on('error', reject);
    socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
  });
  const until = async predicate => {
    for (let i = 0; i < 160; i++) {
      try { const state = await request('status'); if (predicate(state)) return state; } catch {}
      if (child?.exitCode !== null && child?.exitCode !== undefined) break;
      await delay(25);
    }
    throw Error('Synthetic wake daemon did not reach expected state: ' + output);
  };
  try {
    await writeFile(join(root, 'events.jsonl'), '');
    const sdk = join(root, 'sdk.mjs');
    await writeFile(sdk, `import {readFile,appendFile} from 'node:fs/promises';
export class GatewayClient {
 constructor(options){this.options=options;this.index=0;this.count=0;this.id=null;}
 async start(){this.options.onHelloOk({});this.timer=setInterval(async()=>{
  const rows=(await readFile(process.env.HOME+'/events.jsonl','utf8')).split('\\n');rows.pop();
  while(this.index<rows.length){const data=JSON.parse(rows[this.index++]);
   if(data.type==='disconnect')this.options.onClose();
   else this.options.onEvent({event:'talk.event',payload:{voiceSessionId:data.voiceSessionId||this.id,talkEvent:data}});}
 },20);}
 async stopAndWait(){clearInterval(this.timer);}
 async request(method,params){
  if(method==='agents.list'){
   if(!this.discovered){this.discovered=true;await new Promise(resolve=>setTimeout(resolve,1500));}
   return {agents:[{id:'main',name:'Synthetic main'}]};}
  if(method==='node.list')return {nodes:[]};
  if(method==='sessions.resolve')return {ok:true,key:params.key,agentId:'main'};
  if(method==='sessions.list')return {sessions:[{key:params.search,agentId:'main'}]};
  if(method==='config.get')return {config:{auth:{profiles:{fixture:{provider:'openai',mode:'oauth'}}}}};
  if(method==='talk.catalog')return {realtime:{ready:true}};
  if(method==='talk.client.create'){const id=this.id='synthetic-'+(++this.count);
   await appendFile(process.env.HOME+'/grants',id+'\\n');
   setTimeout(()=>this.options.onEvent({event:'talk.event',payload:{voiceSessionId:id,talkEvent:{type:'session.ready'}}}),20);
   return {provider:'openai',transport:'webrtc',model:'gpt-live-1-codex',clientControl:{owner:'gateway'},
    offerUrl:'/plugins/openai/realtime/calls',voiceSessionId:id,clientSecret:'synthetic-grant'};}
  if(method==='talk.client.close'){this.id=null;return {};}
  throw Error('Unexpected synthetic RPC');
 }
}
export async function startGatewayClientWhenEventLoopReady(client){await client.start();}`);
    const python = join(root, 'fake-python');
    await writeFile(python, `#!/usr/bin/python3
import fcntl,json,os,select,sys
from pathlib import Path
home=Path(os.environ['HOME']);lock=(home/'input.lock').open('a')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
wake=sys.argv[1].endswith('/native/wake.py')
assert wake or sys.argv[1].endswith('/native/audio.py')
with (home/'workers').open('a') as receipt:receipt.write(('wake' if wake else 'talk')+'\\n')
if wake:json.loads(sys.stdin.readline())
print(json.dumps({'event':'ready'} if wake else {'event':'ready','syntheticSilence':False}),flush=True)
started=False;buffer=b'';woke=False
while True:
 if select.select([sys.stdin],[],[],0.03)[0]:
  chunk=os.read(sys.stdin.fileno(),8192)
  if not chunk:break
  buffer+=chunk
  while b'\\n' in buffer:
   line,buffer=buffer.split(b'\\n',1);message=json.loads(line)
   if message['command']=='start':started=True
   else:assert message['command'] in ('mute','quiet')
 if wake:
  if not woke and (home/'wake-now').exists():
   (home/'wake-now').unlink();woke=True;print('{"event":"wake"}',flush=True)
  else:print('{"event":"heartbeat"}',flush=True)
 elif started:print('{"event":"levels","active":true,"captureReady":true,"input":0,"output":0,"muted":false,"outputMuted":false}',flush=True)
`, { mode: 0o700 });
    await writeFile(join(root, 'pactl'), `#!/usr/bin/python3
import json,sys
kind=sys.argv[-1]
print(json.dumps([{'name':'fixture-mic','description':'Synthetic input','monitor_of_sink':None}] if kind=='sources'
 else [{'name':'fixture-speaker','description':'Synthetic output'}] if kind=='sinks'
 else {'default_source_name':'fixture-mic','default_sink_name':'fixture-speaker'}))
`, { mode: 0o700 });
    const config = join(root, 'config/openclaw-voice'); await mkdir(config, { recursive: true });
    await writeFile(join(root, 'gateway.json'), '{}');
    await writeFile(join(config, 'config.json'), JSON.stringify({ openclawConfig: join(root, 'gateway.json'),
      gatewaySdk: sdk, python, wake: { enabled: true, inactivitySeconds: 1 } }));
    child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
      env: { PATH: root + ':' + process.env.PATH, HOME: root, XDG_RUNTIME_DIR: root, XDG_CONFIG_HOME: join(root, 'config') }, stdio: 'pipe',
    });
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    await until(state => state.connected && state.destination?.state === 'stale');
    const counts = async () => { try { return (await readFile(join(root, 'workers'), 'utf8')).trim().split('\n'); } catch { return []; } };
    assert.deepEqual(await counts(), []);
    assert.equal((await request('status')).wakeInactivitySeconds, 1);
    // The bar sends toggle. A cold click must remain cancellable during discovery,
    // and neither that click nor a second click in Standby may bypass the wake.
    assert.equal((await request('toggle')).standbyStarting, true);
    await request('toggle'); await until(state => !state.standbyStarting && state.status === 'idle');
    await delay(1700); assert.deepEqual(await counts(), []);
    await request('toggle'); await until(state => state.standby);
    await delay(100); assert.deepEqual(await counts(), ['wake']);
    await assert.rejects(readFile(join(root, 'grants')), { code: 'ENOENT' });
    await request('toggle'); await until(state => !state.standby && state.status === 'idle');
    assert.deepEqual(await counts(), ['wake']);
    await assert.rejects(readFile(join(root, 'grants')), { code: 'ENOENT' });
    await request('toggle'); await until(state => state.standby);
    const wake = async () => { await writeFile(join(root, 'wake-now'), 'yes'); await until(state => state.active); };
    const event = async value => appendFile(join(root, 'events.jsonl'), JSON.stringify(value) + '\n');
    await wake();
    await event({ type: 'transcript.done', seq: 1, turnId: 'question', payload: { text: 'Synthetic question' } });
    await event({ type: 'output.text.done', seq: 2, turnId: 'question', payload: { text: 'Synthetic retained answer.' } });
    await event({ type: 'turn.ended', seq: 3, turnId: 'question' });
    const idle = await until(state => state.standby);
    assert.equal(idle.answer.text, 'Synthetic retained answer.');
    assert.equal(idle.lastResult, 'Synthetic retained answer.');
    assert.equal(idle.requested, false);
    await wake();
    await event({ type: 'output.text.done', seq: 4, turnId: 'quote', payload: { text: 'Return to standby' } });
    await event({ type: 'transcript.done', seq: 5, turnId: 'command', payload: { role: 'user', text: 'Go back to standby, please.' } });
    await until(state => state.standby);
    const beforeStop = await counts(); assert.deepEqual(beforeStop, ['wake', 'wake', 'talk', 'wake', 'talk', 'wake']);
    await request('stop'); await until(state => !state.standby && !state.requested && state.status === 'idle');
    await event({ type: 'transcript.done', voiceSessionId: 'synthetic-2', seq: 6, turnId: 'old', payload: { text: 'Return to standby' } });
    await delay(1100); assert.deepEqual(await counts(), beforeStop);
    await request('toggle'); await until(state => state.standby); await wake();
    await request('toggle'); await until(state => !state.requested && state.status === 'idle');
    const afterToggleStop = await counts(); await delay(1100); assert.deepEqual(await counts(), afterToggleStop);
    await request('standby-conversation'); await until(state => state.standby); await wake();
    await event({ type: 'disconnect' });
    await until(state => !state.connected && !state.requested && !state.standby);
    const disconnectedCount = await counts(); await delay(1100); assert.deepEqual(await counts(), disconnectedCount);
    const exiting = once(child, 'exit'); child.kill('SIGTERM'); assert.equal((await exiting)[0], 0); child = null;
    assert.doesNotMatch(output, /Traceback|EWOULDBLOCK|UnhandledPromise/);
  } finally {
    if (child) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
    await rm(root, { recursive: true, force: true });
  }
});
