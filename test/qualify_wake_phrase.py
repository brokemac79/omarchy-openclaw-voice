"""Offline phrase probe using generated eSpeak speech; never opens audio devices."""
import argparse
import hashlib
from importlib.metadata import version
import json
import platform
from pathlib import Path
import subprocess
import sys

import numpy as np
from openwakeword.model import Model
from synthetic_speech import speech_pcm

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake_gate import WakeGate

parser = argparse.ArgumentParser(description=__doc__)
for name in ('model', 'melspec', 'embedding'):
    parser.add_argument('--' + name, required=True, type=Path)
args = parser.parse_args()
for path in vars(args).values():
    if not path.is_file() or path.suffix != '.onnx':
        parser.error('Each model argument must name an existing ONNX file.')
np.random.seed(0)
model = Model(wakeword_models=[str(args.model)], inference_framework='onnx',
              melspec_model_path=str(args.melspec), embedding_model_path=str(args.embedding))
results = []
phrases = [('Hey Open Claw', True), ('Hey Claude', False),
           ('Hello computer', False), ('Open the door', False)]
for voice in ('en-gb', 'en-us'):
    for speed in (130, 175, 220):
        for phrase, expected in phrases:
            pcm = speech_pcm(phrase, voice, speed)
            np.random.seed(0); model.reset(); gate = WakeGate()
            maximum, audible_maximum, hit = 0.0, 0.0, False
            consecutive = audible_consecutive = longest = audible_longest = 0
            for offset in range(0, len(pcm) - 1279, 1280):
                frame = pcm[offset:offset + 1280]
                scores = model.predict(frame)
                assert len(scores) == 1
                score = float(next(iter(scores.values())))
                maximum = max(maximum, score)
                audible = bool(np.max(np.abs(frame.astype(np.int32))) > 100)
                if audible:
                    audible_maximum = max(audible_maximum, score)
                consecutive = consecutive + 1 if score >= gate.threshold else 0
                audible_consecutive = audible_consecutive + 1 if audible and score >= gate.threshold else 0
                longest, audible_longest = max(longest, consecutive), max(audible_longest, audible_consecutive)
                hit |= gate.accept(score, audible)
            results.append({'phrase': phrase, 'expectedWake': expected, 'voice': voice,
                            'wordsPerMinute': speed, 'peakScore': maximum,
                            'peakAudibleScore': audible_maximum, 'longestAboveThreshold': longest,
                            'longestAudibleAboveThreshold': audible_longest, 'gateWake': bool(hit)})
print(json.dumps({'modelSha256': hashlib.sha256(args.model.read_bytes()).hexdigest(),
                  'python': platform.python_version(),
                  'versions': {name: version(name) for name in ('openwakeword', 'onnxruntime', 'numpy')},
                  'generator': subprocess.check_output(['espeak-ng', '--version'], text=True).splitlines()[0],
                  'generatedOnly': True, 'roomAccuracyQualified': False,
                  'positiveHits': sum(row['gateWake'] for row in results if row['expectedWake']),
                  'positiveCases': sum(row['expectedWake'] for row in results),
                  'negativeHits': sum(row['gateWake'] for row in results if not row['expectedWake']),
                  'negativeCases': sum(not row['expectedWake'] for row in results),
                  'cases': results}, indent=2))
