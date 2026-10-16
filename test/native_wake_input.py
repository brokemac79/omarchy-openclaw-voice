"""Child fixture: generated PCM over stdin, actual detector, no physical devices."""
import json
from pathlib import Path
import sys
import time

import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
from wake import run

options = json.loads(sys.stdin.buffer.readline(8193))
audio = sys.stdin.buffer.read(1048577)
if not audio or len(audio) > 1048576 or len(audio) % 2:
    raise SystemExit('Invalid generated fixture input')
pcm = np.frombuffer(audio, dtype='<i2')
events = []
started, cpu = time.monotonic(), time.process_time()
run(options, synthetic=True, synthetic_pcm=pcm, emit_event=events.append)
# Linux ru_maxrss can retain the speech-generating parent's pre-exec peak.
# VmHWM belongs to this worker's address space and excludes that parent.
peak_rss = next(int(line.split()[1]) for line in Path('/proc/self/status').read_text().splitlines()
                if line.startswith('VmHWM:'))
print(json.dumps({'events': events, 'wallSeconds': time.monotonic() - started,
                  'cpuSeconds': time.process_time() - cpu,
                  'workerPeakRssKiB': peak_rss}))
