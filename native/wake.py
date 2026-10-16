#!/usr/bin/env python3
"""Optional local openWakeWord worker. No network, recording or audio IPC."""
import json
from pathlib import Path
import signal
import sys
import threading

from wake_gate import WakeGate


def run(options, synthetic=False, predictor=None, emit_event=None, synthetic_frames=None):
    # Models are explicit external files. Never download a default model, accept
    # an arbitrary command or fall back to a different phrase/backend.
    paths = {}
    if predictor is None:
        for name in ('model', 'melspec', 'embedding'):
            path = Path(options[name])
            if not path.is_absolute() or path.suffix != '.onnx' or not path.is_file():
                raise ValueError('Missing local ONNX model')
            paths[name] = str(path)
    gate = WakeGate(options.get('threshold', 0.5), options.get('consecutive', 3))
    import numpy as np
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import GLib, Gst
    Gst.init(None)
    if predictor is None:
        from openwakeword.model import Model
        model = Model(wakeword_models=[paths['model']], inference_framework='onnx',
                      melspec_model_path=paths['melspec'], embedding_model_path=paths['embedding'])
        predictor = model.predict
    loop = GLib.MainLoop()
    # Reuse the existing PulseAudio/PipeWire native input path. No WebRTC,
    # encoder, filesink, playback or network element exists in this pipeline.
    source = 'audiotestsrc name=capture is-live=true wave=sine' if synthetic else 'pulsesrc name=capture do-timestamp=true'
    pipeline = Gst.parse_launch(
        source + ' ! audioconvert ! audioresample ! '
        'audio/x-raw,format=S16LE,rate=16000,channels=1 ! '
        'appsink name=frames emit-signals=true max-buffers=2 sync=false')
    device = options.get('inputDevice')
    if device and not synthetic:
        if not isinstance(device, str) or len(device) > 512:
            raise ValueError('Invalid input device')
        pipeline.get_by_name('capture').set_property('device', device)
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
            buffer = frame.get_buffer()
            if buffer.get_size() > 16384:
                raise ValueError('Oversized audio frame')
            pending.extend(buffer.extract_dup(0, buffer.get_size()))
            while len(pending) >= 2560:
                pcm = np.frombuffer(bytes(pending[:2560]), dtype='<i2')
                del pending[:2560]
                scores = predictor(pcm)
                if len(scores) != 1:
                    raise ValueError('Expected one wake phrase')
                audible = bool(np.max(np.abs(pcm.astype(np.int32))) > 100)
                if gate.accept(float(next(iter(scores.values()))), audible):
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

    def eof():
        sys.stdin.buffer.read(1)
        GLib.idle_add(stop)

    if not synthetic:
        threading.Thread(target=eof, daemon=True).start()
    try:
        pipeline.set_state(Gst.State.PLAYING)
        result, state, _ = pipeline.get_state(5 * Gst.SECOND)
        if result == Gst.StateChangeReturn.FAILURE or state != Gst.State.PLAYING:
            raise RuntimeError('Local input unavailable')
        emit('ready')
        accepting.set()
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
