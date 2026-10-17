"""Generated tone through actual GStreamer fake output; never physical audio."""
from array import array
import json
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch

source = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(source))
from native import audio_check
from native.device_binding import bind_device

# Inspect actual PulseAudio plugin properties in NULL state, opening no device.
for factory in ('pulsesrc', 'pulsesink'):
    element = audio_check.Gst.ElementFactory.make(factory)
    bind_device(element, 'fixture-device', audio_check.Gst)
    assert element.get_property('device') == 'fixture-device'
    props = element.get_property('stream-properties')
    assert all(props.get_value(key) for key in ('node.dont-fallback', 'node.dont-move', 'node.dont-reconnect'))
    assert element.get_state(0)[1] == audio_check.Gst.State.NULL

events, peaks, pipelines = [], [], []
original = audio_check.Gst.parse_launch


def build(description):
    assert 'pulsesrc' not in description and 'pulsesink' not in description
    pipeline = original(description)
    pipelines.append(pipeline)
    sink = pipeline.get_by_name('device')
    sink.set_property('signal-handoffs', True)

    def sample(_sink, buffer, _pad):
        values = array('h', buffer.extract_dup(0, buffer.get_size()))
        peaks.append(max(abs(value) for value in values))

    sink.connect('handoff', sample)
    return pipeline


started = time.monotonic()
with patch.object(audio_check.Gst, 'parse_launch', build):
    audio_check.run({'mode': 'speaker', 'device': 'fixture-speaker'}, synthetic=True, watch_stdin=False,
                    observe=lambda event, **fields: events.append(event))
assert events == ['ready', 'complete'], events
assert peaks and max(peaks) > 100 and max(peaks) < 4000
assert 1.5 < time.monotonic() - started < 4
assert pipelines[0].get_state(0)[1] == audio_check.Gst.State.NULL

for close_by in ('stop', 'eof'):
    worker = subprocess.Popen([sys.executable, str(source / 'native/audio_check.py'), '--synthetic'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    worker.stdin.write(json.dumps({'mode': 'speaker', 'device': 'fixture-speaker'}) + '\n')
    worker.stdin.flush()
    assert json.loads(worker.stdout.readline()) == {'event': 'ready', 'synthetic': True}
    if close_by == 'stop':
        worker.terminate()
    else:
        worker.stdin.close()
    assert worker.wait(timeout=3) == 0, worker.stderr.read()

script = '''
import assert from 'node:assert/strict';
import {AudioDevices} from DEVICES;
import {launchAudioCheck} from CHECK;
const owner=new AudioDevices({path:'/unused',discover:async()=>({input:[],output:[{name:'fixture-speaker',label:'Synthetic output'}],
 defaults:{output:'fixture-speaker'}}),launch:options=>launchAudioCheck({python:PYTHON},{...options,synthetic:true})});
await owner.startCheck('speaker');assert.equal(owner.operation,'checking');
await assert.rejects(owner.forVoice(),error=>error.code==='audio_busy');
const deadline=Date.now()+4000;
while(owner.occupied&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(owner.occupied,false);assert.equal(owner.releaseFault,false);await owner.cleanup;
console.log('PASS actual local owner/wrapper/native tone completion and release with fake output only.');
'''.replace('DEVICES', json.dumps((source / 'src/audio-devices.mjs').as_uri())).replace(
    'CHECK', json.dumps((source / 'src/local-audio-check.mjs').as_uri())).replace('PYTHON', json.dumps(sys.executable))
subprocess.run(['node', '--input-type=module', '-e', script], check=True, timeout=8)
print('PASS generated local test tone: real nonzero bounded samples into a fake sink, two-second expiry, pipeline release, SIGTERM and control EOF; no input, physical output or provider.')
