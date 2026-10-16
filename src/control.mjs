import net from 'node:net';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function listenControl(runtime, dispatch) {
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  if (!(await lstat(runtime)).isDirectory()) throw new Error('Invalid runtime directory.');
  await chmod(runtime, 0o700);
  // Linux abstract sockets are released by the kernel on exit, including SIGKILL.
  // Lock by directory identity so aliases cannot create two owners of one path.
  const directory = await lstat(runtime);
  const lock = net.createServer(socket => socket.destroy());
  await new Promise((resolve, reject) => {
    lock.once('error', reject);
    lock.listen(`\0openclaw-voice-${process.getuid()}-${directory.dev}-${directory.ino}`, resolve);
  });
  try {
    const path = join(runtime, 'control.sock');
    try {
      if (!(await lstat(path)).isSocket()) throw new Error('Invalid control socket.');
      const active = await new Promise((resolve, reject) => {
        const probe = net.connect(path);
        probe.once('connect', () => { probe.destroy(); resolve(true); });
        probe.once('error', error => {
          if (['ECONNREFUSED', 'ENOENT'].includes(error.code)) resolve(false); else reject(error);
        });
        probe.setTimeout(1000, () => { probe.destroy(); reject(new Error('Control socket busy.')); });
      });
      if (active) throw new Error('Voice service is already running.');
      await unlink(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const clients = new Set();
    const server = net.createServer(socket => {
      clients.add(socket); socket.once('close', () => clients.delete(socket));
      socket.on('error', () => {}); socket.setTimeout(35000, () => socket.destroy());
      socket.setEncoding('utf8');
      let buffer = '', received = false;
      socket.on('data', chunk => {
        if (received) return;
        buffer += chunk;
        if (buffer.length > 8192) { socket.destroy(); return; }
        if (!buffer.includes('\n')) return;
        received = true;
        void (async () => {
          try {
            const data = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
            const result = await dispatch(data?.command, { invokedAtMs: data?.invokedAtMs });
            socket.end(JSON.stringify({ ok: true, ...result }) + '\n');
          } catch { socket.end(JSON.stringify({ ok: false, error: 'Voice command failed. Check connection and voice configuration.' }) + '\n'); }
        })();
      });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(path, resolve);
    });
    await chmod(path, 0o600);
    const identity = await lstat(path);
    return {
      async close() {
        for (const client of clients) client.destroy();
        await new Promise(resolve => server.close(resolve));
        try { if ((await lstat(path)).ino === identity.ino) await unlink(path); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        finally { await new Promise(resolve => lock.close(resolve)); }
      },
    };
  } catch (error) {
    await new Promise(resolve => lock.close(resolve));
    throw error;
  }
}
