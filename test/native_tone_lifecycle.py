"""Repeated local-tone teardown; generated audio and fake output only."""
import json
import os
from pathlib import Path
import resource
import select
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
source = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(source))
from native import audio_check

# Keep the input pipe open through natural completion, matching the Node
# parent's lifetime. All Python callbacks must be detached before run returns.
read_fd, write_fd = os.pipe()
sources = []


def watch(original):
    def register(*args, **kwargs):
        identifier = original(*args, **kwargs)
        sources.append(identifier)
        return identifier
    return register


try:
    with patch.object(audio_check.sys, 'stdin', SimpleNamespace(fileno=lambda: read_fd)), \
            patch.object(audio_check.GLib, 'unix_signal_add', watch(audio_check.GLib.unix_signal_add)), \
            patch.object(audio_check.GLib, 'io_add_watch', watch(audio_check.GLib.io_add_watch)), \
            patch.object(audio_check.GLib, 'timeout_add', watch(audio_check.GLib.timeout_add)):
        audio_check.run({'mode': 'speaker', 'device': 'fixture-speaker'}, synthetic=True,
                        observe=lambda *_args, **_kwargs: None)
    context = audio_check.GLib.MainContext.default()
    assert len(set(sources)) >= 4, f'Expected signal/input/timer sources, observed {sources}'
    assert not any(context.find_source_by_id(identifier) for identifier in sources), \
        'Tone returned with live signal/input/timer callbacks retaining its objects'
finally:
    for identifier in sources:
        if audio_check.GLib.MainContext.default().find_source_by_id(identifier):
            audio_check.GLib.source_remove(identifier)
    os.close(read_fd); os.close(write_fd)
print('PASS tone return detaches signal/input/timer callbacks before Python teardown.')

sources.clear()


def unavailable_stdin():
    raise OSError('Synthetic input unavailable')


try:
    with patch.object(audio_check.sys, 'stdin', SimpleNamespace(fileno=unavailable_stdin)), \
            patch.object(audio_check.GLib, 'unix_signal_add', watch(audio_check.GLib.unix_signal_add)):
        try:
            audio_check.run({'mode': 'speaker', 'device': 'fixture-speaker'}, synthetic=True)
            raise AssertionError('Unavailable control input was accepted')
        except OSError as error:
            assert str(error) == 'Synthetic input unavailable'
    assert len(set(sources)) >= 2
    assert not any(context.find_source_by_id(identifier) for identifier in sources), \
        'Partial startup retained signal callbacks after failing'
finally:
    for identifier in sources:
        if context.find_source_by_id(identifier):
            audio_check.GLib.source_remove(identifier)
print('PASS partial tone startup detaches callbacks before propagating its error.')

for case, count in (('complete', 8), ('signal', 16), ('eof', 16)):
    for attempt in range(count):
        worker = subprocess.Popen([sys.executable, str(source / 'native/audio_check.py'), '--synthetic'],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            worker.stdin.write(b'{"mode":"speaker","device":"fixture-speaker"}\n'); worker.stdin.flush()
            assert select.select([worker.stdout], [], [], 5)[0], f'Tone {case}: readiness timed out'
            assert json.loads(worker.stdout.readline()) == {'event': 'ready', 'synthetic': True}
            if case == 'signal':
                worker.terminate()  # Keep stdin open until after exit.
            elif case == 'eof':
                worker.stdin.close()
            worker.wait(timeout=5)
            diagnostics = worker.stderr.read()
            assert worker.returncode == 0, f'Tone {case} #{attempt + 1}: exit {worker.returncode}'
            assert not any(marker in diagnostics for marker in (b'Fatal Python error', b'Traceback'))
            events = [json.loads(line) for line in worker.stdout.read().splitlines()]
            if case == 'complete':
                assert events == [{'event': 'complete'}]
        finally:
            if worker.poll() is None:
                worker.kill(); worker.wait(timeout=5)
            if not worker.stdin.closed:
                worker.stdin.close()
            worker.stdout.close(); worker.stderr.close()
    print(f'PASS {count} repeated tone {case} exits, synthetic output only.')
