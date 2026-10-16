#!/usr/bin/env python3
"""Offline native media proof: generated tones, local WebRTC peers, fake sinks."""
import json
from array import array
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from native.audio import AudioWorker, GLib, Gst, GstSdp, GstWebRTC, check


def prove_media():
    check()
    loop = GLib.MainLoop()
    worker = AudioWorker(synthetic=True)
    peer = Gst.parse_launch(
        'webrtcbin name=rtc bundle-policy=max-bundle '
        'audiotestsrc is-live=true wave=sine freq=880 volume=0.25 ! '
        'audioconvert ! audioresample ! audio/x-raw,rate=48000,channels=1 ! '
        'opusenc ! rtpopuspay name=sender pt=111 ! '
        'application/x-rtp,media=audio,encoding-name=OPUS,payload=111,clock-rate=48000 ! rtc. '
        'queue name=incoming ! rtpopusdepay ! opusdec ! audioconvert ! '
        'level name=received interval=80000000 ! fakesink sync=true async=false'
    )
    rtc = peer.get_by_name('rtc')
    evidence = {'send': False, 'receive': False, 'loss_concealed': False,
                'quiet': False, 'resumed': False, 'muted': False}
    failures = []
    phase = ['audio', 0.0]
    latest_received = [-100.0]
    latest_output = [0.0]
    latest_played_peak = [0]
    answer_sent = [False]
    sent_packets = [0]

    def drop_packet(_pad, _info):
        # Deterministic loss on the fake peer only: exercise actual WebRTC gap
        # signalling and Opus concealment, not just a configured property.
        sent_packets[0] += 1
        return Gst.PadProbeReturn.DROP if sent_packets[0] % 10 == 0 else Gst.PadProbeReturn.OK

    peer.get_by_name('sender').get_static_pad('src').add_probe(Gst.PadProbeType.BUFFER, drop_packet)

    def fail(reason):
        failures.append(reason)
        loop.quit()
        return False

    def answer_created(promise, *_):
        reply = promise.get_reply()
        answer = reply.get_value('answer')
        rtc.emit('set-local-description', answer, Gst.Promise.new())

    def remote_set(*_):
        rtc.emit('create-answer', None, Gst.Promise.new_with_change_func(answer_created, None, None))

    def send_answer():
        if not answer_sent[0]:
            answer_sent[0] = True
            worker.answer(rtc.get_property('local-description').sdp.as_text())
        return False

    def gathered(*_):
        if rtc.get_property('ice-gathering-state') == GstWebRTC.WebRTCICEGatheringState.COMPLETE:
            GLib.idle_add(send_answer)

    def output(event, **data):
        if event == 'error':
            fail('worker: ' + data['code'])
        elif event == 'offer':
            result, sdp = GstSdp.SDPMessage.new_from_text(data['sdp'])
            assert result == GstSdp.SDPResult.OK
            offer = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.OFFER, sdp)
            rtc.emit('set-remote-description', offer, Gst.Promise.new_with_change_func(remote_set, None, None))
        elif event == 'levels':
            latest_output[0] = data['output']
            if data['active'] and data['output'] > 0.02:
                evidence['receive'] = True

    def incoming(_, pad):
        if pad.get_direction() == Gst.PadDirection.SRC:
            pad.link(peer.get_by_name('incoming').get_static_pad('sink'))

    def message(_, msg):
        if msg.type == Gst.MessageType.ERROR:
            fail('peer pipeline error')
        elif msg.type == Gst.MessageType.ELEMENT:
            structure = msg.get_structure()
            if structure and structure.get_name() == 'level':
                latest_received[0] = max(structure.get_value('rms'))
                if phase[0] == 'audio' and latest_received[0] > -42:
                    evidence['send'] = True

    def inspect():
        stats = worker.pipeline.get_by_name('decoder').get_property('stats')
        if stats and stats.get_value('plc-num-samples') > 0:
            evidence['loss_concealed'] = True
        if phase[0] == 'audio' and evidence['send'] and evidence['receive'] and evidence['loss_concealed']:
            phase[:] = ['quiet', time.monotonic()]
            worker.command({'command': 'quiet', 'outputMuted': True})
        elif phase[0] == 'quiet' and time.monotonic() - phase[1] > 2:
            if latest_output[0] == 0 and latest_played_peak[0] < 10 and latest_received[0] > -42 and worker.output_muted and not worker.muted:
                evidence['quiet'] = True
                phase[:] = ['resume', time.monotonic()]
                worker.command({'command': 'quiet', 'outputMuted': False})
        elif phase[0] == 'resume' and time.monotonic() - phase[1] > 1 and latest_output[0] > 0.02 and latest_played_peak[0] > 100:
            evidence['resumed'] = True
            phase[:] = ['mute', time.monotonic()]
            worker.command({'command': 'mute', 'muted': True})
        elif phase[0] == 'mute' and time.monotonic() - phase[1] > 2:
            if latest_received[0] < -60 and worker.muted and latest_output[0] > 0.02 and not worker.output_muted:
                evidence['muted'] = True
                loop.quit()
                return False
        return True

    worker.emit = output
    rtc.connect('notify::ice-gathering-state', gathered)
    rtc.connect('pad-added', incoming)
    bus = peer.get_bus(); bus.add_signal_watch(); bus.connect('message', message)
    peer.set_state(Gst.State.PLAYING)
    worker.start({'muted': False})
    playback = worker.pipeline.get_by_name('playback')
    playback.set_property('signal-handoffs', True)
    def played(_sink, buffer, _pad):
        pcm = array('h', buffer.extract_dup(0, buffer.get_size()))
        latest_played_peak[0] = max(abs(value) for value in pcm)
    playback.connect('handoff', played)
    # Replace synthetic silence with a generated tone only inside this offline test.
    source = worker.pipeline.get_by_name('capture')
    source.set_property('wave', 0); source.set_property('freq', 440); source.set_property('volume', 0.25)
    deadline = GLib.timeout_add_seconds(30, lambda: fail('media proof timed out'))
    inspect_timer = GLib.timeout_add(100, inspect)
    try:
        loop.run()
    finally:
        GLib.source_remove(deadline)
        if loop.get_context().find_source_by_id(inspect_timer):
            GLib.source_remove(inspect_timer)
        worker.stop(); peer.set_state(Gst.State.NULL)
    assert not failures, failures
    assert all(evidence.values()), evidence
    assert worker.pipeline.get_state(Gst.SECOND)[1] == Gst.State.NULL
    print('PASS: native send, receive/loss concealment, output Quiet/resume, independent input mute and release; no physical audio devices.')


def prove_eof():
    script = Path(__file__).resolve().parents[1] / 'native/audio.py'
    result = subprocess.run([sys.executable, str(script), '--synthetic-silence'],
                            input=json.dumps({'command': 'start'}) + '\n',
                            text=True, capture_output=True, timeout=8)
    assert result.returncode == 0, 'Worker did not exit cleanly on control EOF.'
    print('PASS: control EOF releases the synthetic worker.')


if __name__ == '__main__':
    prove_media()
    prove_eof()
