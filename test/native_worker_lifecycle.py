"""Native protocol and process teardown; synthetic source and fake sinks only."""
import json
from pathlib import Path
import select
import subprocess
import sys
import time

worker_path = Path(__file__).resolve().parents[1] / 'native/audio.py'
cases = ('signal-ready', 'signal-starting', 'signal-partial', 'stop-command', 'malformed', 'nested', 'oversized', 'eof')
for case in cases:
    worker = subprocess.Popen([sys.executable, str(worker_path), '--synthetic-silence'],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        assert select.select([worker.stdout], [], [], 5)[0], f'{case}: worker readiness timed out'
        assert json.loads(worker.stdout.readline()) == {'event': 'ready', 'syntheticSilence': True}
        if case in ('signal-starting', 'stop-command'):
            worker.stdin.write(b'{"command":"start"}\n'); worker.stdin.flush()
            time.sleep(0.1)
        if case == 'signal-partial':
            worker.stdin.write(b'{"command":'); worker.stdin.flush()
        if case.startswith('signal-'):
            worker.terminate()  # Deliberately leave stdin open, as a service-manager signal can.
        elif case == 'stop-command':
            worker.stdin.write(b'{"command":"stop"}\n'); worker.stdin.flush()
        elif case == 'malformed':
            worker.stdin.write(b'not-json\n'); worker.stdin.flush()
        elif case == 'nested':
            worker.stdin.write(b'[' * 2000 + b'0' + b']' * 2000 + b'\n'); worker.stdin.flush()
        elif case == 'oversized':
            worker.stdin.write(b'x' * 131073); worker.stdin.flush()
        else:
            worker.stdin.close()
        worker.wait(timeout=5)
        stderr = worker.stderr.read()
        assert worker.returncode == 0, f'{case}: worker did not exit cleanly ({worker.returncode})'
        assert not any(marker in stderr for marker in (b'Fatal Python error', b'Traceback', b'RecursionError')), \
            f'{case}: unexpected worker failure diagnostics'
        if case in ('malformed', 'nested', 'oversized'):
            events = [json.loads(line) for line in worker.stdout.read().splitlines()]
            assert any(event.get('event') == 'error' for event in events), case
    finally:
        if worker.poll() is None:
            worker.kill(); worker.wait(timeout=5)
        if not worker.stdin.closed:
            worker.stdin.close()
        worker.stdout.close(); worker.stderr.close()
print('PASS eight actual native shutdown/protocol cases: SIGTERM with open/partial stdin, startup, Stop, malformed/nested/oversized input and EOF; generated audio only.')
