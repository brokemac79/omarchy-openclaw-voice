// Background WebRTC engine. The visible interface is the native OMA QML plugin.
const { key, input, output } = window.antVoice || {};
const headers = { 'x-ant-voice-key': key || '' };
const speaker = document.getElementById('speaker');
let stream, peer, context, micMeter, replyMeter, timer, startupTimer;
let epoch = 0, active = false, starting = false, muted = false, posting = false;
let state = 'idle', caption = 'Microphone off';
const aborter = new AbortController();
async function request(path, method = 'POST', body) {
  const response = await fetch(path, { method, headers, body, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Voice service unavailable.');
  return data;
}
function stopLocal() {
  epoch++; clearTimeout(startupTimer); clearInterval(timer);
  stream?.getTracks().forEach(t => t.stop()); stream = undefined;
  if (peer) { peer.onconnectionstatechange = null; peer.close(); peer = undefined; }
  context?.close().catch(() => {}); context = undefined;
  micMeter = replyMeter = undefined; speaker.pause(); speaker.srcObject = null;
  active = starting = muted = false; state = 'idle'; caption = 'Microphone off';
}
async function fail(message) {
  stopLocal();
  await request('/engine-error', 'POST', JSON.stringify({ message })).catch(() => {});
}
function analyser(media) {
  const node = context.createAnalyser(); node.fftSize = 512;
  context.createMediaStreamSource(media).connect(node);
  return node;
}
function level(node) {
  if (!node) return 0;
  const values = new Float32Array(node.fftSize); node.getFloatTimeDomainData(values);
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  return rms < 0.008 ? 0 : Math.min(1, rms * 5);
}
async function telemetry() {
  if (posting || (!active && !starting)) return;
  posting = true;
  try {
    await request('/telemetry', 'POST', JSON.stringify({ state, caption, active, muted,
      input: muted ? 0 : level(micMeter), output: speaker.paused ? 0 : level(replyMeter) }));
  } catch { stopLocal(); } finally { posting = false; }
}
async function start() {
  if (starting || active) return;
  starting = true; const current = ++epoch;
  state = 'thinking'; caption = 'Connecting to Ant';
  startupTimer = setTimeout(() => { if (current === epoch) void fail('Voice startup timed out.'); }, 40000);
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      ...(input ? { deviceId: { exact: input } } : {}),
    }, video: false });
    if (current !== epoch) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    context = new AudioContext(); await context.resume(); micMeter = analyser(stream);
    timer = setInterval(() => { void telemetry(); }, 80);
    if (output) await speaker.setSinkId(output);
    await request('/create');
    if (current !== epoch) return;
    const pc = new RTCPeerConnection(); peer = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => {
      if (current !== epoch) return;
      const remote = event.streams[0] || new MediaStream([event.track]);
      speaker.srcObject = remote; replyMeter = analyser(remote);
      speaker.play().catch(() => { void fail('Audio playback was unavailable.'); });
    };
    pc.onconnectionstatechange = () => {
      if (current !== epoch) return;
      if (pc.connectionState === 'connected') {
        clearTimeout(startupTimer); starting = false; active = true;
        state = 'listening'; caption = 'Ant is listening'; void telemetry();
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        void fail('Voice connection ended. Press the shortcut to reconnect.');
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    const response = await fetch('/offer', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/sdp' },
      body: pc.localDescription.sdp, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('GPT-Live could not connect. Check gateway Talk diagnostics.');
    if (current !== epoch) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
  } catch (error) {
    if (current !== epoch) return;
    await fail(error.name === 'NotAllowedError' ? 'Microphone permission unavailable.' : 'Voice audio startup failed. Check audio devices and the gateway.');
  }
}
function event({ event, data }) {
  if (event === 'start') void start();
  if (event === 'stop' || event === 'disconnected') stopLocal();
  if (event === 'mute') {
    muted = !muted; stream?.getAudioTracks().forEach(t => t.enabled = !muted);
    caption = muted ? 'Microphone muted' : 'Ant is listening'; void telemetry();
  }
  if (event !== 'talk' || (!active && !starting)) return;
  const p = data.payload || {};
  const text = p.text ?? p.transcript ?? p.delta;
  if (typeof text === 'string' && text) caption = text.slice(0, 240);
  if (data.type === 'transcript.delta') state = 'listening';
  if (data.type === 'transcript.done') state = 'thinking';
  if (data.type === 'output.audio.started') state = 'acting';
  if (data.type === 'output.audio.done' || data.type === 'turn.ended') state = 'listening';
  if (data.type === 'tool.call') state = 'acting';
  if (data.type === 'session.closed' || data.type === 'session.error') stopLocal();
}
async function events() {
  try {
    const response = await fetch('/events', { headers, signal: aborter.signal });
    if (!response.ok) throw new Error('No engine connection.');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    window.engineReady = true;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (frame.startsWith('data: ')) event(JSON.parse(frame.slice(6)));
      }
    }
  } finally { stopLocal(); }
}
window.addEventListener('pagehide', () => { stopLocal(); aborter.abort(); });
if (key) void events().catch(() => {});
