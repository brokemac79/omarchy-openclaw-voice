import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listenControl } from '../src/control.mjs';
test('Unix controls are private, reject malformed input and preserve the running owner', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-control-'));
  const control = await listenControl(directory, async command => {
    if (command !== 'status') throw new Error('Bad command'); return { active: false };
  });
  const request = data => new Promise((resolve, reject) => {
    const socket = net.connect(join(directory, 'control.sock'), () => socket.end(data));
    let buffer = ''; socket.on('data', chunk => { buffer += chunk; });
    socket.on('error', reject); socket.on('end', () => resolve(JSON.parse(buffer)));
  });
  try {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(directory, 'control.sock'))).mode & 0o777, 0o600);
    assert.equal((await request('//\n')).ok, false);
    assert.equal((await request('{"command":"status"}\n')).active, false);
    await assert.rejects(listenControl(directory, () => {}), /already running|EADDRINUSE/);
    assert.equal((await request('{"command":"status"}\n')).ok, true);
  } finally { await control.close(); await rm(directory, { recursive: true, force: true }); }
});

test('concurrent stale-socket recovery elects exactly one reachable owner', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-stale-'));
  const path = join(directory, 'control.sock');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      'import net from "node:net"; net.createServer().listen(process.argv[1], () => process.exit(0));', path]);
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('fixture failed')));
  });
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => listenControl(directory, async () => ({ active: false }))));
  const winners = results.filter(r => r.status === 'fulfilled');
  try {
    assert.equal(winners.length, 1);
    await new Promise((resolve, reject) => {
      const client = net.connect(path, () => client.write('{"command":"status"}\n'));
      client.on('error', reject); client.once('data', data => {
        try { assert.equal(JSON.parse(data).ok, true); client.destroy(); resolve(); } catch (error) { reject(error); }
      });
    });
  } finally {
    for (const winner of winners) await winner.value.close();
    await rm(directory, { recursive: true, force: true });
  }
});
