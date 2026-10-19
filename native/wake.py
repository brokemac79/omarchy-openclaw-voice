#!/usr/bin/env python3
"""Optional local wake worker. No network, recording or audio IPC."""
import json
import signal
import sys
import threading

from wake_gate import WakeGate
from wake_models import load_detector
from device_binding import bind_device, device_matches


def run(options, synthetic=False, predictor=None, emit_event=None, synthetic_frames=None, synthetic_pcm=None,
        watch_stdin=None):
    # Models are explicit external files. Never download a default model, accept
    # an arbitrary command or fall back to a different phrase/backend.
    if synthetic_pcm is not None and not synthetic:
        raise ValueError('Generated PCM requires synthetic input')
    if predictor is None:
        score, gate = load_detector(options)
    else:
        gate = WakeGate(options.get('threshold', 0.5), options.get('consecutive', 3))

        def score(frame):
            scores = predictor(frame)
            if len(scores) != 1:
                raise ValueError('Expected one wake phrase')
            return float(next(iter(scores.values())))
    import numpy as np
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import GLib, Gst
    Gst.init(None)
    loop = GLib.MainLoop()
    # Reuse the existing PulseAudio/PipeWire native input path. No WebRTC,
    # encoder, filesink, playback or network element exists in this pipeline.
    source = 'audiotestsrc name=capture is-live=true wave=sine' if synthetic else 'pulsesrc name=capture do-timestamp=true'
    if synthetic_pcm is not None:
        source = 'appsrc name=capture is-live=true format=time block=true max-bytes=5120'
    pipeline = Gst.parse_launch(
        source + ' ! audioconvert ! audioresample ! '
        'audio/x-raw,format=S16LE,rate=16000,channels=1 ! '
        'appsink name=frames emit-signals=true max-buffers=2 sync=false' + (' async=false' if synthetic_pcm is not None else ''))
    if synthetic_pcm is not None:
        pipeline.get_by_name('capture').set_property('caps', Gst.Caps.from_string('audio/x-raw,format=S16LE,rate=16000,channels=1,layout=interleaved'))
    device = options.get('inputDevice')
    if device and not synthetic:
        if not isinstance(device, str) or len(device) > 512:
            raise ValueError('Invalid input device')
        bind_device(pipeline.get_by_name('capture'), device, Gst)
    pending = bytearray()
    processed = 0
    stopping = threading.Event()
    accepting = threading.Event()

    def emit(event):
        if emit_event:
            emit_event(event)
        else:
            print(json.dumps({'event': event}), flush=True)

    def stop():
        stopping.set()
        loop.quit()
        return False

    def sample(sink):
        nonlocal processed
        frame = sink.emit('pull-sample')
        if stopping.is_set():
            return Gst.FlowReturn.FLUSHING
        if not accepting.is_set():
            return Gst.FlowReturn.OK
        try:
            if not synthetic and device and not device_matches(pipeline.get_by_name('capture'), device):
                raise ValueError('Input device changed')
            buffer = frame.get_buffer()
            if buffer.get_size() > 16384:
                raise ValueError('Oversized audio frame')
            pending.extend(buffer.extract_dup(0, buffer.get_size()))
            while len(pending) >= 2560:
                pcm = np.frombuffer(bytes(pending[:2560]), dtype='<i2')
                del pending[:2560]
                audible = bool(np.max(np.abs(pcm.astype(np.int32))) > 100)
                if gate.accept(score(pcm), audible):
                    # Stop consuming locally at detection. The owner must await
                    # process release before launching a fresh Talk input stream.
                    stopping.set(); emit('wake'); GLib.idle_add(stop)
                    break
                processed += 1
                if synthetic and synthetic_frames is not None and processed >= synthetic_frames:
                    stopping.set(); emit('complete'); GLib.idle_add(stop)
                    break
            return Gst.FlowReturn.OK
        except Exception:
            stopping.set(); emit('error'); GLib.idle_add(stop)
            return Gst.FlowReturn.ERROR

    pipeline.get_by_name('frames').connect('new-sample', sample)
    bus = pipeline.get_bus(); bus.add_signal_watch()
    bus.connect('message', lambda _bus, msg: stop() if msg.type in (Gst.MessageType.ERROR, Gst.MessageType.EOS) else None)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, stop)
    GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, stop)

    observe_parent = not synthetic if watch_stdin is None else watch_stdin
    if observe_parent:
        # Observe parent closure without leaving a buffered-stdin thread alive
        # during interpreter shutdown. Any control input also releases wake.
        GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR | GLib.IO_NVAL,
                          lambda *_args: stop())
    try:
        pipeline.set_state(Gst.State.PLAYING)
        result, state, _ = pipeline.get_state(5 * Gst.SECOND)
        if result == Gst.StateChangeReturn.FAILURE or state != Gst.State.PLAYING:
            raise RuntimeError('Local input unavailable')
        emit('ready')
        accepting.set()
        if synthetic_pcm is not None:
            def feed():
                capture = pipeline.get_by_name('capture')
                for offset in range(0, len(synthetic_pcm), 1280):
                    if stopping.is_set():
                        break
                    data = synthetic_pcm[offset:offset + 1280].astype('<i2').tobytes()
                    frame = Gst.Buffer.new_allocate(None, len(data), None)
                    frame.fill(0, data); frame.pts = offset * Gst.SECOND // 16000
                    frame.duration = len(data) * Gst.SECOND // 32000
                    if capture.emit('push-buffer', frame) != Gst.FlowReturn.OK:
                        break
                capture.emit('end-of-stream')
            threading.Thread(target=feed, daemon=True).start()
        GLib.timeout_add(1000, lambda: (emit('heartbeat'), True)[1] if not stopping.is_set() else False)
        if not stopping.is_set():
            loop.run()
    finally:
        stopping.set(); pipeline.set_state(Gst.State.NULL); pending.clear()


def main():
    options = json.loads(sys.stdin.buffer.readline(8193))
    run(options)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"event":"error"}', flush=True)
        raise SystemExit(1)
