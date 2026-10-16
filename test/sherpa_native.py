"""Actual worker proof: neural generated phrase, controls, silence, source EOF."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from piper import PiperVoice
from synthetic_speech import speech_pcm

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model-directory', required=True, type=Path)
parser.add_argument('--piper-model', required=True, type=Path)
args = parser.parse_args()
names = {'encoder': 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'decoder': 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'joiner': 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'tokens': 'tokens.txt', 'bpe': 'bpe.model'}
options = {'backend': 'sherpa-onnx', 'phrase': 'Hey Open Claw',
           **{key: str((args.model_directory / name).resolve()) for key, name in names.items()}}
voice = PiperVoice.load(args.piper_model)
cases = [('phrase', speech_pcm('Hey Open Claw', 'piper-ljspeech', 175, neural_voice=voice), True),
         ('other phrase', speech_pcm('Hey Claude', 'piper-ljspeech', 175, neural_voice=voice), False),
         ('silence', np.zeros(96000, dtype=np.int16), False),
         ('tone', (np.sin(np.arange(96000) * 2 * np.pi * 440 / 16000) * 8000).astype(np.int16), False)]
for name, pcm, expected in cases:
    data = json.dumps(options).encode() + b'\n' + pcm.astype('<i2').tobytes()
    child = subprocess.run([sys.executable, str(Path(__file__).with_name('native_wake_input.py'))],
                           input=data, capture_output=True, timeout=20)
    if child.returncode:
        raise RuntimeError('Generated worker failed: ' + child.stderr.decode(errors='replace'))
    assert not child.stderr, child.stderr.decode(errors='replace')
    receipt = json.loads(child.stdout)
    events = receipt['events']
    assert events[0] == 'ready' and 'error' not in events, events
    assert events.count('wake') == int(expected), (name, events)
    print('PASS generated ' + name + ': ' + json.dumps(receipt))
