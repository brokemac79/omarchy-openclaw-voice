import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('real daemon switches only after review, binds calls/events to the selected context and restores selection without audio',
  { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'voice-routing-'));
    let child, output = '';
    const socketPath = join(root, 'openclaw-voice/control.sock');
    const catalogPath = join(root, 'catalog.json'), eventPath = join(root, 'event.json');
    const receipt = join(root, 'rpc.jsonl'), media = join(root, 'media.txt');
    const publish = async (path, data) => { await writeFile(path + '.tmp', JSON.stringify(data)); await rename(path + '.tmp', path); };
    const request = (command = 'status', fields = {}) => new Promise((resolve, reject) => {
      const socket = net.connect(socketPath, () => socket.write(JSON.stringify({ command, ...fields }) + '\n'));
      let data = ''; socket.setTimeout(1500, () => socket.destroy(new Error('Synthetic control timeout')));
      socket.on('error', reject); socket.on('data', value => { data += value; });
      socket.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
    });
    const until = async predicate => {
      for (let i = 0; i < 150; i++) {
        try { const state = await request(); if (predicate(state)) return state; } catch {}
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Destination fixture did not reach expected state: ' + output);
    };
    const calls = async () => (await readFile(receipt, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const catalog = { agents: [{ id: 'alpha', name: 'Synthetic Alpha' }, { id: 'beta', name: 'Synthetic Beta' }],
      sessions: [{ key: 'agent:alpha:main', agentId: 'alpha' }, { key: 'agent:beta:work', agentId: 'beta', execNode: 'fixture-node' }],
      nodes: [{ nodeId: 'fixture-node', displayName: 'Synthetic workstation', connected: true, paired: true }] };
    const stop = async () => {
      if (!child || child.exitCode !== null) return;
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const killer = setTimeout(() => child.kill('SIGKILL'), 2500);
      try { await exited; } finally { clearTimeout(killer); }
    };
    try {
      await publish(catalogPath, catalog); await publish(eventPath, {}); await writeFile(receipt, '');
      const sdk = join(root, 'sdk.mjs');
      await writeFile(sdk, `import {readFile,appendFile} from 'node:fs/promises';
        export class GatewayClient {
          constructor(opts){this.opts=opts;this.count=0;}
          async start(){this.opts.onHelloOk({auth:{method:'device-token'}});let last='',reading=false;
            this.timer=setInterval(async()=>{if(reading)return;reading=true;try{
              const raw=await readFile(process.env.FIXTURE_EVENT,'utf8');if(raw===last)return;last=raw;
              const event=JSON.parse(raw);if(event.event)this.opts.onEvent(event);
            }finally{reading=false;}},15);}
          async stopAndWait(){clearInterval(this.timer);}
          async request(method,params={}){
            const data=JSON.parse(await readFile(process.env.FIXTURE_CATALOG,'utf8'));
            if(method==='agents.list')return {agents:data.agents};
            if(method==='node.list')return {nodes:data.nodes};
            if(method==='sessions.resolve'){const row=data.sessions.find(row=>row.key===params.key);return row?{ok:true,key:row.key,agentId:row.agentId}:{ok:false};}
            if(method==='sessions.list')return {sessions:data.sessions.filter(row=>row.key===params.search)};
            if(method==='config.get')return {config:{auth:{profiles:{fixture:{provider:'openai',mode:'oauth'}}}}};
            if(method==='talk.catalog')return {realtime:{ready:true}};
            if(method==='talk.client.create'){
              const voiceSessionId='fixture-voice-'+(++this.count);
              await appendFile(process.env.FIXTURE_RECEIPT,JSON.stringify({method,sessionKey:params.sessionKey,voiceSessionId})+'\\n');
              setTimeout(()=>this.opts.onEvent({event:'talk.event',payload:{voiceSessionId,talkEvent:{type:'session.ready'}}}),20);
              return {provider:'openai',transport:'webrtc',model:'gpt-live-1-codex',clientControl:{owner:'gateway'},offerUrl:'/plugins/openai/realtime/calls',voiceSessionId,clientSecret:'synthetic-secret'};
            }
            if(method==='talk.client.close'){await appendFile(process.env.FIXTURE_RECEIPT,JSON.stringify({method,...params})+'\\n');return {};}
            throw Error('Unexpected RPC in synthetic fixture');
          }
        }
        export async function startGatewayClientWhenEventLoopReady(client){await client.start();}`);
      const worker = join(root, 'fake-python');
      await writeFile(worker, `#!/usr/bin/python3
import json, pathlib, select, sys
if not sys.argv[1].endswith('/native/audio.py') or '--synthetic-silence' not in sys.argv: raise SystemExit('Synthetic worker only')
print('{"event":"ready","syntheticSilence":true}',flush=True)
active=False
while True:
 if select.select([sys.stdin],[],[],0.1)[0]:
  line=sys.stdin.readline()
  if not line: break
  message=json.loads(line)
  if message['command']=='start':
   with pathlib.Path(${JSON.stringify(media)}).open('a') as out: out.write('start\\n')
   active=True
 if active: print('{"event":"levels","active":true,"captureReady":true,"input":0,"output":0}',flush=True)
`, { mode: 0o700 });
      const configDirectory = join(root, 'config/openclaw-voice'); await mkdir(configDirectory, { recursive: true });
      const gateway = join(root, 'gateway.json'); await writeFile(gateway, JSON.stringify({ gateway: { mode: 'local' } }));
      await writeFile(join(configDirectory, 'config.json'), JSON.stringify({ openclawConfig: gateway, gatewaySdk: sdk,
        python: worker, sessionKey: 'agent:alpha:main', destinations: [{ id: 'work', label: 'Synthetic work', sessionKey: 'agent:beta:work', nodeId: 'fixture-node' }] }));
      const start = () => {
        child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
          env: { PATH: process.env.PATH, HOME: root, XDG_CONFIG_HOME: join(root, 'config'), XDG_RUNTIME_DIR: root,
            OPENCLAW_VOICE_TEST_SILENCE: '1', FIXTURE_CATALOG: catalogPath, FIXTURE_EVENT: eventPath, FIXTURE_RECEIPT: receipt }, stdio: 'pipe' });
        child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
      };
      const talk = async (voiceSessionId, text, seq) => publish(eventPath, { event: 'talk.event', payload: {
        voiceSessionId, talkEvent: { type: 'output.text.done', turnId: 'fixture-turn', seq, payload: { text } } } });
      start(); await until(state => state.destination?.state === 'ready');
      assert.equal((await request('toggle')).requested, true); await until(state => state.active);
      const first = (await calls()).find(call => call.method === 'talk.client.create');
      assert.equal(first.sessionKey, 'agent:alpha:main');
      assert.equal((await request('select-destination', { destinationId: 'work' })).selectionChanged, false);
      assert.equal((await request()).active, true);
      await talk(first.voiceSessionId, 'Synthetic Alpha result.', 1); await until(state => state.lastResult === 'Synthetic Alpha result.');
      await request('stop');
      assert.equal((await request('select-destination', { destinationId: 'work' })).selectionChanged, false);
      assert.equal((await request()).lastResult, 'Synthetic Alpha result.');
      await request('dismiss-result');
      assert.equal((await request('select-destination', { destinationId: 'work' })).selectionChanged, true);
      assert.equal((await request()).destination.agent, 'Synthetic Beta');
      await request('toggle'); await until(state => state.active);
      const second = (await calls()).filter(call => call.method === 'talk.client.create')[1];
      assert.equal(second.sessionKey, 'agent:beta:work');
      await talk(first.voiceSessionId, 'Synthetic stale Alpha reply.', 50);
      await new Promise(resolve => setTimeout(resolve, 60)); assert.equal((await request()).lastResult, '');
      await talk(second.voiceSessionId, 'Synthetic Beta result.', 2); await until(state => state.lastResult === 'Synthetic Beta result.');
      catalog.nodes[0].connected = false; await publish(catalogPath, catalog); await request('destinations');
      await until(state => !state.requested && state.destination.state === 'unavailable');
      assert.equal((await request()).lastResult, 'Synthetic Beta result.');
      const starts = await readFile(media, 'utf8'); await request('toggle');
      assert.equal(await readFile(media, 'utf8'), starts);
      await stop(); await publish(eventPath, {}); catalog.nodes[0].connected = true; await publish(catalogPath, catalog);
      start(); const restored = await until(state => state.destination?.state === 'ready');
      assert.equal(restored.destination.id, 'work'); assert.equal(restored.requested, false); assert.equal(restored.active, false);
      assert.equal(await readFile(media, 'utf8'), starts);
      assert.ok(!output.includes('synthetic-secret'));
      assert.deepEqual((await calls()).filter(call => call.method === 'talk.client.close').map(call => call.sessionKey), ['agent:alpha:main', 'agent:beta:work']);
    } finally { await stop(); await rm(root, { recursive: true, force: true }); }
  });
