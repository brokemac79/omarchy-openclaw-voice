#!/usr/bin/env python3
"""Native audio/WebRTC worker. Bounded JSON control on stdio; no credentials."""
import argparse
import json
import math
import signal
import sys
import threading
import time

import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstWebRTC', '1.0')
gi.require_version('GstSdp', '1.0')
from gi.repository import GLib, Gst, GstSdp, GstWebRTC

Gst.init(None)
REQUIRED = ['webrtcbin', 'nicesrc', 'dtlssrtpenc', 'opusenc', 'opusdec',
            'rtpopuspay', 'rtpopusdepay', 'audioconvert', 'audioresample',
            'webrtcdsp', 'webrtcechoprobe', 'level', 'volume', 'pulsesrc', 'pulsesink']


def check():
    missing = [name for name in REQUIRED if not Gst.ElementFactory.find(name)]
    if missing:
        raise RuntimeError('Missing GStreamer plugins: ' + ', '.join(missing))


class AudioWorker:
    def __init__(self, synthetic=False):
        self.synthetic = synthetic
        self.loop = GLib.MainLoop()
        self.pipeline = self.webrtc = None
        self.offer_sent = self.stopping = self.connected = self.muted = False
        self.input_level = self.output_level = 0.0
        self.output_updated = 0.0
        self.negotiating = False

    def emit(self, event, **data):
        if self.stopping:
            return
        try:
            print(json.dumps({'event': event, **data}, allow_nan=False), flush=True)
        except (BrokenPipeError, OSError):
            self.stop()

    def stop(self):
        if self.stopping:
            return False
        self.stopping = True
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)
        self.loop.quit()
        return False

    def fail(self, code):
        self.emit('error', code=code)
        self.stop()
        return False

    def start(self, command):
        if self.pipeline:
            return self.fail('already-started')
        self.muted = command.get('muted') is True
        source = 'audiotestsrc name=capture is-live=true wave=silence' if self.synthetic else 'pulsesrc name=capture do-timestamp=true'
        sink = 'fakesink sync=true async=false' if self.synthetic else 'pulsesink name=playback sync=true async=false'
        # The echo probe is created before capture starts, in the same pipeline.
        # PulseAudio elements connect to Omarchy's PipeWire compatibility server.
        description = (
            'webrtcbin name=rtc bundle-policy=max-bundle latency=50 '
            'queue name=incoming max-size-time=200000000 max-size-buffers=0 max-size-bytes=0 ! '
            'rtpopusdepay ! opusdec ! audioconvert ! audioresample ! '
            'audio/x-raw,format=S16LE,rate=48000,channels=1 ! '
            'level name=reply interval=80000000 ! webrtcechoprobe name=echo ! ' + sink + ' '
            + source + ' ! audioconvert ! audioresample ! '
            'audio/x-raw,format=S16LE,rate=48000,channels=1 ! '
            'webrtcdsp probe=echo echo-cancel=true noise-suppression=true gain-control=true ! '
            'volume name=micmute ! level name=microphone interval=80000000 ! '
            'opusenc audio-type=voice bitrate=32000 frame-size=20 ! rtpopuspay pt=111 ! '
            'application/x-rtp,media=audio,encoding-name=OPUS,payload=111,clock-rate=48000 ! rtc.'
        )
        self.pipeline = Gst.parse_launch(description)
        self.webrtc = self.pipeline.get_by_name('rtc')
        if not self.synthetic:
            for option, element in [('inputDevice', 'capture'), ('outputDevice', 'playback')]:
                value = command.get(option)
                if value:
                    if not isinstance(value, str) or len(value) > 512:
                        return self.fail('invalid-device')
                    self.pipeline.get_by_name(element).set_property('device', value)
        self.pipeline.get_by_name('micmute').set_property('mute', self.muted)
        self.webrtc.connect('on-negotiation-needed', self.negotiate)
        self.webrtc.connect('notify::ice-gathering-state', self.gathered)
        self.webrtc.connect('notify::connection-state', self.connection_changed)
        self.webrtc.connect('pad-added', self.remote_pad)
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect('message', self.message)
        if self.pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            return self.fail('audio-start-failed')
        GLib.timeout_add(250, self.heartbeat)

    def negotiate(self, *_):
        if self.stopping or self.negotiating:
            return
        self.negotiating = True
        promise = Gst.Promise.new_with_change_func(self.created_offer, None, None)
        self.webrtc.emit('create-offer', None, promise)

    def created_offer(self, promise, *_):
        try:
            if self.stopping:
                return
            reply = promise.get_reply()
            offer = reply.get_value('offer') if reply else None
            if not offer:
                GLib.idle_add(self.fail, 'offer-failed')
                return
            self.webrtc.emit('set-local-description', offer, Gst.Promise.new())
        except Exception:
            GLib.idle_add(self.fail, 'offer-failed')

    def gathered(self, *_):
        if not self.stopping and self.webrtc.get_property('ice-gathering-state') == GstWebRTC.WebRTCICEGatheringState.COMPLETE:
            GLib.idle_add(self.send_offer)

    def send_offer(self):
        if self.stopping or self.offer_sent:
            return False
        description = self.webrtc.get_property('local-description')
        if not description:
            return self.fail('offer-missing')
        self.offer_sent = True
        self.emit('offer', sdp=description.sdp.as_text())
        return False

    def answer(self, sdp):
        if not self.webrtc or not isinstance(sdp, str) or len(sdp) > 131072 or not sdp.startswith('v=0'):
            return self.fail('invalid-answer')
        result, message = GstSdp.SDPMessage.new_from_text(sdp)
        if result != GstSdp.SDPResult.OK:
            return self.fail('invalid-answer')
        answer = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.ANSWER, message)
        self.webrtc.emit('set-remote-description', answer, Gst.Promise.new())

    def connection_changed(self, *_):
        state = self.webrtc.get_property('connection-state').value_nick
        if state == 'connected':
            self.connected = True
            GLib.idle_add(lambda: (self.emit('connected'), False)[1])
        elif state in ('failed', 'disconnected', 'closed') and not self.stopping:
            GLib.idle_add(self.fail, 'connection-' + state)

    def remote_pad(self, _, pad):
        if pad.get_direction() != Gst.PadDirection.SRC or self.stopping:
            return
        target = self.pipeline.get_by_name('incoming').get_static_pad('sink')
        if not target.is_linked() and pad.link(target) != Gst.PadLinkReturn.OK:
            GLib.idle_add(self.fail, 'receive-link-failed')

    def message(self, _, message):
        if self.stopping:
            return
        if message.type == Gst.MessageType.ERROR:
            # Do not echo device names, addresses, SDP or library diagnostics.
            self.fail('audio-pipeline-error')
        elif message.type == Gst.MessageType.EOS:
            self.fail('audio-device-ended')
        elif message.type == Gst.MessageType.ELEMENT:
            structure = message.get_structure()
            if structure and structure.get_name() == 'level':
                values = structure.get_value('rms')
                db = max(values) if values else -100
                value = min(1.0, 5 * 10 ** (db / 20)) if math.isfinite(db) and db > -42 else 0.0
                if message.src.get_name() == 'microphone':
                    self.input_level = 0.0 if self.muted else value
                else:
                    self.output_level = value
                    self.output_updated = time.monotonic()

    def heartbeat(self):
        if self.stopping:
            return False
        if time.monotonic() - self.output_updated > 0.3:
            self.output_level = 0.0
        self.emit('levels', active=self.connected, muted=self.muted,
                  input=self.input_level, output=self.output_level)
        return True

    def command(self, command):
        if self.stopping:
            return False
        try:
            if not isinstance(command, dict):
                return self.fail('invalid-command')
            action = command.get('command')
            if action == 'start':
                self.start(command)
            elif action == 'answer':
                self.answer(command.get('sdp'))
            elif action == 'mute' and self.pipeline:
                self.muted = command.get('muted') is True
                self.pipeline.get_by_name('micmute').set_property('mute', self.muted)
                if self.muted:
                    self.input_level = 0.0
                self.heartbeat()
            elif action == 'stop':
                self.stop()
            else:
                self.fail('invalid-command')
        except Exception:
            self.fail('audio-command-failed')
        return False

    def read_commands(self):
        try:
            while True:
                line = sys.stdin.buffer.readline(131073)
                if not line:
                    break
                if len(line) > 131072:
                    GLib.idle_add(self.fail, 'command-too-large')
                    return
                GLib.idle_add(self.command, json.loads(line))
        except (ValueError, OSError):
            GLib.idle_add(self.fail, 'invalid-command')
            return
        GLib.idle_add(self.stop)

    def run(self):
        threading.Thread(target=self.read_commands, daemon=True).start()
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, self.stop)
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, self.stop)
        self.emit('ready', syntheticSilence=self.synthetic)
        try:
            self.loop.run()
        finally:
            self.stop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--synthetic-silence', action='store_true')
    args = parser.parse_args()
    check()
    if args.check:
        print('GStreamer voice dependencies ready; no audio devices opened.')
        return
    AudioWorker(args.synthetic_silence).run()


if __name__ == '__main__':
    main()
