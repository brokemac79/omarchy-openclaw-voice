"""Explicit offline runtime qualification; generated signals, no audio devices."""
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
from openwakeword.model import Model

parser = argparse.ArgumentParser(description=__doc__)
for field in ('model', 'melspec', 'embedding'):
    parser.add_argument('--' + field, required=True, type=Path)
args = parser.parse_args()
hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in vars(args).items()}
started = time.monotonic()
model = Model(wakeword_models=[str(args.model)], inference_framework='onnx',
              melspec_model_path=str(args.melspec), embedding_model_path=str(args.embedding))
load_seconds = time.monotonic() - started
results = {}
for name, frame in [('silence', np.zeros(1280, dtype=np.int16)),
                    ('tone', (np.sin(np.arange(1280) * 2 * np.pi * 440 / 16000) * 8000).astype(np.int16))]:
    model.reset()
    wall, cpu = time.monotonic(), time.process_time()
    scores = []
    for _ in range(250):  # 20 seconds per generated signal
        result = model.predict(frame)
        assert len(result) == 1
        score = float(next(iter(result.values())))
        assert np.isfinite(score) and 0 <= score <= 1
        scores.append(score)
    results[name] = {'audioSeconds': 20, 'wallSeconds': time.monotonic() - wall,
                     'cpuSeconds': time.process_time() - cpu, 'maxScore': max(scores)}
print(json.dumps({'architecture': platform.machine(), 'python': platform.python_version(),
                  'versions': {name: version(name) for name in ('openwakeword', 'onnxruntime', 'numpy')},
                  'sha256': hashes, 'loadSeconds': load_seconds,
                  'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                  'signals': results, 'accuracyQualified': False}, indent=2))

# Exercise the actual worker, GStreamer capture substitution and installed model
# together. Production CLI cannot select synthetic input or this frame limit.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake import run
events = []
run({name: str(path.resolve()) for name, path in vars(args).items()},
    synthetic=True, synthetic_frames=50, emit_event=events.append)
assert events[0] == 'ready' and events[-1] == 'complete' and 'wake' not in events and 'error' not in events, events
print('PASS actual openWakeWord model and GStreamer worker, generated tone only; no wake accuracy claim.')
