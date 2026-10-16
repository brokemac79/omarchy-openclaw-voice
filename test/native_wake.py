"""Actual GStreamer wake input proof with generated audio and a fake predictor."""
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake import run

events, frames = [], []
started = time.monotonic()


def predict(pcm):
    assert pcm.dtype.name == 'int16' and len(pcm) == 1280
    assert max(abs(int(x)) for x in pcm) > 100
    frames.append(len(pcm))  # counts only, no retained audio
    return {'fixture': 0.9}


run({}, synthetic=True, predictor=predict, emit_event=events.append)
assert events[0] == 'ready' and events.count('wake') == 1 and 'error' not in events, events
assert len(frames) == 28, len(frames)
print(f'PASS generated GStreamer input, 80ms frames, settling and one wake; {time.monotonic() - started:.3f}s')
