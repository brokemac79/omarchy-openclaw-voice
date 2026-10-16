"""Actual Omarchy QML recovery from absent runtime files; synthetic state, no audio."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid

if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
    raise SystemExit('Run in the Linux graphical session. No audio devices are used.')

source = Path(__file__).resolve().parents[1]
failures = []
for case in ('preexisting-state', 'missing-file', 'missing-parent', 'recreated-parent', 'still-absent'):
    name = 'bootproof-' + uuid.uuid4().hex[:12]
    runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
    process = None
    try:
        with tempfile.TemporaryDirectory(prefix='voice-cold-start-') as directory:
            root = Path(directory)
            for module in ('Commons', 'Ui', 'services'):
                (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module,
                                           target_is_directory=True)
            (root / 'plugin').mkdir()
            for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml',
                             'Instance.js', 'openclaw-voice.svg'):
                shutil.copyfile(source / filename, root / 'plugin' / filename)
            receipt = root / 'unexpected-control'
            control = root / 'control'
            control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\n'
                               'Path(' + repr(str(receipt)) + ').touch()\n')
            control.chmod(0o700)

            def publish():
                runtime.mkdir(mode=0o700, exist_ok=True)
                # Idle keeps diagnostic panels hidden and cannot request audio.
                (runtime / 'state.json').write_text(json.dumps({
                    'status': 'idle', 'text': 'Synthetic startup fixture',
                    'user': 'Fixture input', 'assistant': 'Fixture reply', 'updated': time.time(),
                }))
                (runtime / 'level').write_text('0 0')

            if case in ('preexisting-state', 'recreated-parent'):
                publish()
            elif case == 'missing-file':
                runtime.mkdir(mode=0o700)
            qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceIndicator { id: indicator; voiceInstance: NAME; voiceControl: CONTROL }
  Voice.VoiceOrb { id: panel; voiceInstance: NAME }
  Timer { interval: 400; running: true; onTriggered: console.log("COLD_START_READY " + indicator.status + " " + panel.status) }
  Timer { interval: 3200; running: true; onTriggered: {
    console.log("COLD_START_RESULT " + JSON.stringify({
      indicator: indicator.status, panel: panel.status,
      userCaption: panel.userWords === "Fixture input",
      replyCaption: panel.replyWords === "Fixture reply", awake: panel.awake
    })); Qt.quit();
  } }
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control)))
            (root / 'shell.qml').write_text(qml)
            log = root / 'quickshell.log'
            with log.open('w') as stream:
                process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                           stdout=stream, stderr=subprocess.STDOUT, text=True)
                deadline = time.monotonic() + 5
                while 'COLD_START_READY ' not in log.read_text():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('QML fixture did not become ready: ' + log.read_text())
                    time.sleep(0.025)
                initial = 'idle idle' if case in ('preexisting-state', 'recreated-parent') else 'stopped stopped'
                if 'COLD_START_READY ' + initial not in log.read_text():
                    raise RuntimeError('Unexpected initial QML state: ' + log.read_text())
                if case == 'recreated-parent':
                    shutil.rmtree(runtime)
                    time.sleep(0.3)
                    publish()
                elif case in ('missing-file', 'missing-parent'):
                    publish()
                process.wait(timeout=8)
            output = log.read_text()
            rows = [json.loads(line.split('COLD_START_RESULT ', 1)[1])
                    for line in output.splitlines() if 'COLD_START_RESULT ' in line]
            present = case != 'still-absent'
            expected = {'indicator': 'idle' if present else 'stopped',
                        'panel': 'idle' if present else 'stopped',
                        'userCaption': present, 'replyCaption': present, 'awake': False}
            if process.returncode or rows != [expected] or receipt.exists():
                failures.append(case)
                print('FAIL:', case, rows, 'controlCalled=' + str(receipt.exists()))
                if process.returncode or not rows:
                    print(output)
            else:
                print('PASS:', case, 'captions/state recovered; no control or audio request')
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.communicate(timeout=3)
        if runtime.exists():
            shutil.rmtree(runtime)

if failures:
    raise SystemExit('Cold-start QML recovery failed: ' + ', '.join(failures))
