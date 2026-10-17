"""Actual GStreamer wake input proof with generated audio and a fake predictor."""
from pathlib import Path
import json
import select
import subprocess
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

# Exercise the production parent-closure watcher with generated input. Signals
# must also exit cleanly when the parent deliberately keeps stdin open.
for action in ('signal', 'eof', 'input'):
    code = ('import sys; sys.path.insert(0, ' + repr(str(Path(__file__).resolve().parents[1] / 'native')) + '); '
            'from wake import run; run({}, synthetic=True, predictor=lambda _: {"fixture": 0}, watch_stdin=True)')
    worker = subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert select.select([worker.stdout], [], [], 5)[0], f'Wake {action}: readiness timed out'
        assert json.loads(worker.stdout.readline()) == {'event': 'ready'}
        if action == 'signal':
            worker.terminate()
        elif action == 'eof':
            worker.stdin.close()
        else:
            worker.stdin.write(b'stop'); worker.stdin.flush()
        worker.wait(timeout=5)
        assert worker.returncode == 0, f'Wake {action}: unclean exit {worker.returncode}'
        assert b'Fatal Python error' not in worker.stderr.read()
    finally:
        if worker.poll() is None:
            worker.kill(); worker.wait(timeout=5)
        if not worker.stdin.closed:
            worker.stdin.close()
        worker.stdout.close(); worker.stderr.close()
print('PASS wake parent closure/input and SIGTERM with open stdin; generated input and fake predictor only.')
