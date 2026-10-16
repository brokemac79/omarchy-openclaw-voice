"""Offline custom-phrase probe; generated speech, no accounts or audio devices."""
import argparse
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import resource
import sys
import time

import numpy as np

from synthetic_speech import speech_pcm
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake_models import load_detector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--model-directory', required=True, type=Path)
parser.add_argument('--phrase', default='Hey Open Claw')
parser.add_argument('--piper-model', type=Path)
args = parser.parse_args()
root = args.model_directory
names = {'encoder': 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'decoder': 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'joiner': 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx',
         'tokens': 'tokens.txt', 'bpe': 'bpe.model'}
paths = {key: root / value for key, value in names.items()}
hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}
options = {'backend': 'sherpa-onnx', 'phrase': args.phrase,
           **{key: str(path.resolve()) for key, path in paths.items()}}
started = time.monotonic()
score, gate = load_detector(options)
load_seconds = time.monotonic() - started
decoder_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
neural_voice = None
if args.piper_model:
    from piper import PiperVoice
    neural_voice = PiperVoice.load(args.piper_model)
voices = ('piper-ljspeech',) if neural_voice else ('en-gb', 'en-us')
results = []
phrases = [(args.phrase, True), ('Hey Claude', False), ('Hello computer', False),
           ('Open the door', False), ('Hey open door', False), ('Open claw', False)]
for voice in voices:
    for speed in (130, 175, 220):
        for phrase, expected in phrases:
            pcm = speech_pcm(phrase, voice, speed, neural_voice=neural_voice)
            score, gate = load_detector(options)
            cpu, wall, hit, raw = time.process_time(), time.monotonic(), False, 0
            for offset in range(0, len(pcm) - 1279, 1280):
                frame = pcm[offset:offset + 1280]
                detected = score(frame)
                raw += int(detected)
                hit |= gate.accept(detected, bool(np.max(np.abs(frame.astype(np.int32))) > 100))
            results.append({'phrase': phrase, 'expectedWake': expected, 'voice': voice,
                            **({'lengthScale': 175 / speed} if neural_voice else {'wordsPerMinute': speed}),
                            'gateWake': bool(hit), 'rawDetections': raw,
                            'audioSeconds': len(pcm) / 16000,
                            'cpuSeconds': time.process_time() - cpu, 'wallSeconds': time.monotonic() - wall})
print(json.dumps({'python': platform.python_version(), 'architecture': platform.machine(), 'phrase': args.phrase,
                  'versions': {name: version(name) for name in ('sherpa-onnx', 'sherpa-onnx-core', 'sentencepiece', 'numpy')},
                  'sha256': hashes, 'loadSeconds': load_seconds,
                  'decoderPeakRssBeforeTtsKiB': decoder_rss,
                  'generator': 'piper' if neural_voice else 'espeak-ng',
                  'generatorModelSha256': hashlib.sha256(args.piper_model.read_bytes()).hexdigest() if neural_voice else None,
                  'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                  'generatedOnly': True, 'roomAccuracyQualified': False,
                  'positiveHits': sum(row['gateWake'] for row in results if row['expectedWake']),
                  'positiveCases': sum(row['expectedWake'] for row in results),
                  'negativeHits': sum(row['gateWake'] for row in results if not row['expectedWake']),
                  'negativeCases': sum(not row['expectedWake'] for row in results),
                  'totalAudioSeconds': sum(row['audioSeconds'] for row in results),
                  'totalCpuSeconds': sum(row['cpuSeconds'] for row in results), 'cases': results}, indent=2))
