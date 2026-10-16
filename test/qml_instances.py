"""Linux QML proof with synthetic state and a fake control executable; no audio."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
    raise SystemExit('Run in the Linux graphical session. No audio devices are used.')

source = Path(__file__).resolve().parents[1]
names = ['proof-' + uuid.uuid4().hex[:12] for _ in range(2)]
runtime_dirs = []
try:
    with tempfile.TemporaryDirectory(prefix='voice-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            target = Path('/usr/share/omarchy/shell') / module
            if not target.is_dir():
                raise SystemExit('Installed Omarchy shell modules are required.')
            (root / module).symlink_to(target, target_is_directory=True)
        (root / 'plugin').mkdir()
        for name in ('VoiceIndicator.qml', 'VoiceControls.qml', 'DestinationPicker.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / name, root / 'plugin' / name)
        for name, label in zip(names, ['Fixture A', 'Fixture B']):
            runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
            runtime.mkdir(mode=0o700)
            runtime_dirs.append(runtime)
            (runtime / 'state.json').write_text(json.dumps({'status': 'idle', 'text': label, 'updated': 1}))
            (runtime / 'level').write_text('0 0')
        receipt = root / 'args.txt'
        control = root / "control with 'quotes'; safe"
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nimport sys\n'
                           'Path(' + repr(str(receipt)) + ').write_text(repr(sys.argv[1:]))\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceOrb { id: a; voiceInstance: FIRST }
  Voice.VoiceOrb { id: b; voiceInstance: SECOND }
  Voice.VoiceIndicator { id: button; voiceInstance: FIRST; voiceControl: CONTROL }
  Voice.VoiceIndicator { id: missing; voiceInstance: SECOND }
  Voice.VoiceIndicator { id: invalid; voiceInstance: "../bad"; voiceControl: CONTROL }
  Timer { interval: 700; running: true; onTriggered: {
    if (a.label !== "Fixture A" || b.label !== "Fixture B" || button.label !== "Fixture A") throw Error("State isolation failed");
    if (a.voiceRuntime === b.voiceRuntime || missing.configured || invalid.configured || invalid.voiceRuntime !== "") throw Error("Control isolation failed");
    if (button.conversation.voiceInstance !== button.voiceInstance || button.conversation.voiceRuntime !== a.voiceRuntime) throw Error("Owned conversation selector mismatch");
    missing.toggleVoice(); invalid.toggleVoice(); button.toggleVoice();
    a.status = "listening"; a.updatedAt = Date.now() / 1000; a.nowSeconds = a.updatedAt;
  } }
  Timer { interval: 1000; running: true; onTriggered: {
    if (!a.conversationVisible || a.orbVisible || a.showOrb || a.statusText !== "Listening") throw Error("Hiding the orb must retain the conversation and status");
    a.showOrb = true;
    if (!a.orbVisible || !a.conversationVisible) throw Error("Legacy orb opt-in must not replace the conversation");
    a.status = "error";
    if (!a.awake || a.conversationVisible || a.statusText !== "Voice unavailable") throw Error("Error status must remain visible without stale conversation");
    a.updatedAt = 1;
    if (a.awake || a.orbVisible || a.conversationVisible) throw Error("Stale state must close all voice overlays");
    console.log("PASS transcript-orb separation, status and stale cleanup");
  } }
  Timer { interval: 1500; running: true; onTriggered: Qt.quit() }
}
'''.replace('FIRST', json.dumps(names[0])).replace('SECOND', json.dumps(names[1])).replace('CONTROL', json.dumps(str(control)))
        (root / 'shell.qml').write_text(qml)
        result = subprocess.run(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                capture_output=True, text=True, timeout=10)
        output = result.stdout + result.stderr
        if (result.returncode or not receipt.exists() or receipt.read_text() != "['toggle']"
                or 'PASS transcript-orb separation, status and stale cleanup' not in output):
            print(result.stdout, result.stderr)
            raise SystemExit('QML instance/control proof failed.')
        print('PASS: actual QML state isolation, control refusal/literal argv, transcript-orb separation, status and stale cleanup.')
finally:
    for runtime in runtime_dirs:
        shutil.rmtree(runtime)
