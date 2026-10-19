#!/usr/bin/env python3
"""Explicit bounded local test tone. No input, recording, WebRTC or provider."""
import argparse
import json
import signal
import sys
import time

import gi
gi.require_version('Gst', '1.0')
from gi.repository import GLib, Gst
if __package__:
    from .device_binding import bind_device, device_matches
else:
    from device_binding import bind_device, device_matches

Gst.init(None)


def run(options, synthetic=False, observe=None, watch_stdin=True):
    mode = options.get('mode')
    if mode != 'speaker':
        raise ValueError('Invalid check')
    source = 'audiotestsrc name=tone is-live=true wave=sine freq=440 volume=0.08'
    sink = 'fakesink name=device sync=true async=false' if synthetic else 'pulsesink name=device sync=true async=false'
    pipeline = Gst.parse_launch(source + ' ! audioconvert ! audioresample ! audio/x-raw,format=S16LE,rate=48000,channels=1 ! ' + sink)
    element = None if synthetic else pipeline.get_by_name('device')
    if element:
        bind_device(element, options.get('device'), Gst)
    loop = GLib.MainLoop()
    stopped = False
    deadline = time.monotonic() + 2

    def emit(event, **fields):
        if observe:
            observe(event, **fields)
        else:
            print(json.dumps({'event': event, **fields}, allow_nan=False), flush=True)

    def stop(complete=False):
        nonlocal stopped
        if not stopped:
            stopped = True
            pipeline.set_state(Gst.State.NULL)
            if complete:
                emit('complete')
            loop.quit()
        return False

    def message(_bus, msg):
        if msg.type in (Gst.MessageType.ERROR, Gst.MessageType.EOS):
            emit('error'); stop()

    def tick():
        if time.monotonic() >= deadline:
            return stop(True)
        if element and not device_matches(element, options['device']):
            emit('error'); return stop()
        return not stopped

    bus = pipeline.get_bus()
    sources = []
    handler = None
    watching = False
    try:
        bus.add_signal_watch(); watching = True
        handler = bus.connect('message', message)
        sources.append(GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, stop))
        sources.append(GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, stop))
        if watch_stdin:
            sources.append(GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, lambda *_: stop()))
        if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            raise RuntimeError('Audio check unavailable')
        emit('ready', synthetic=synthetic)
        sources.append(GLib.timeout_add(100, tick))
        loop.run()
    finally:
        stop()
        # Drop Python callbacks while the interpreter is still running, rather
        # than leaving GLib/bus references to be finalized during process exit.
        for identifier in sources:
            if loop.get_context().find_source_by_id(identifier):
                GLib.source_remove(identifier)
        if handler is not None:
            bus.disconnect(handler)
        if watching:
            bus.remove_signal_watch()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--synthetic', action='store_true')
    args = parser.parse_args()
    try:
        line = sys.stdin.buffer.readline(2049)
        if len(line) > 2048:
            raise ValueError('Oversized check configuration')
        run(json.loads(line), args.synthetic)
    except Exception:
        print('{"event":"error"}', flush=True)
        raise SystemExit(1)
