"""Offline phrase probe using generated eSpeak speech; never opens audio devices."""
import argparse
import hashlib
import io
from importlib.metadata import version
import json
import math
import platform
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np
from openwakeword.model import Model
from scipy.signal import resample_poly

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
            # --stdout emits a WAV stream instead of opening a playback device.
            audio = subprocess.check_output(['espeak-ng', '--stdout', '-v', voice, '-s', str(speed), phrase])
            with wave.open(io.BytesIO(audio)) as wav:
                assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
                rate = wav.getframerate()
                samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2')
            divisor = math.gcd(rate, 16000)
            pcm = resample_poly(samples.astype(np.float32), 16000 // divisor, rate // divisor)
            pcm = np.concatenate((np.zeros(32000), pcm, np.zeros(32000))).clip(-32768, 32767).astype(np.int16)
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
