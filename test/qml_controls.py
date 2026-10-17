"""Real Omarchy controls with fake launcher and synthetic text; no audio."""
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
capture = os.environ.get('OPENCLAW_VOICE_QML_CAPTURE', '')
name = 'controls-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
try:
    with tempfile.TemporaryDirectory(prefix='voice-controls-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'HoldPanel.qml', 'AnswerPanel.qml', 'AnswerText.js', 'DestinationPicker.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        runtime.mkdir(mode=0o700)
        (runtime / 'state.json').write_text(json.dumps({
            'status': 'listening', 'text': 'Talk ready', 'updated': time.time(),
            'callRequested': True, 'inputMuted': False, 'inputMuteRequested': False,
            'speechQuiet': False, 'speechQuietRequested': False, 'workStatus': 'unknown',
            'lastResult': 'Synthetic final text survives Quiet and End voice.'}))
        (runtime / 'level').write_text('0 0')
        receipt = root / 'commands.jsonl'
        control = root / "fake control 'literal;args'"
        control.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\n'
                           'with Path(' + repr(str(receipt)) + ').open("a") as out: out.write(json.dumps(sys.argv[1:])+"\\n")\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceIndicator { id: indicator; voiceInstance: NAME; voiceControl: CONTROL }
  property int index: 0
  property int failures: 0
  Timer { interval: 400; running: true; repeat: true; onTriggered: {
    const panel = indicator.voiceControls;
    if (index === 0) {
      panel.visible = true;
      if (!panel.inCall || panel.invoke("cancel-request") || panel.invoke("toggle")) failures++;
      if (!panel.invoke("quiet")) failures++;
    } else if (index === 1) {
      if (!panel.invoke("mute")) failures++;
      if (CAPTURE_PATH !== "") panel.contentItem.children[0].grabToImage(result => result.saveToFile(CAPTURE_PATH));
    } else if (index === 2) {
      panel.current = false;
      if (panel.invoke("quiet") || panel.invoke("mute")) failures++;
      if (!panel.invoke("stop")) failures++;
      panel.current = true;
      panel.voiceState = ({callRequested:false, text:"Device pairing required", recoveryAction:"Approve this device in OpenClaw, then start voice again."});
      if (panel.inCall || panel.invoke("quiet") || !panel.voiceState.recoveryAction) failures++;
      if (panel.implicitHeight > 620 || panel.implicitHeight < 200) failures++;
    } else {
      panel.visible = false;
      console.log("CONTROLS_QML_RESULT " + failures); Qt.quit();
    }
    index++;
  } }
}'''.replace('NAME', json.dumps(name)).replace('voiceControl: CONTROL', 'voiceControl: ' + json.dumps(str(control))).replace('CAPTURE_PATH', json.dumps(capture))
        (root / 'shell.qml').write_text(qml)
        result = subprocess.run(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                capture_output=True, text=True, timeout=10)
        output = result.stdout + result.stderr
        commands = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        if (result.returncode or 'CONTROLS_QML_RESULT 0' not in output or commands != [['quiet'], ['mute'], ['stop']]
                or any(error in output for error in ('ReferenceError', 'TypeError', 'Failed to load configuration'))
                or (capture and not Path(capture).is_file())):
            print(output)
            raise SystemExit('Voice controls QML proof failed: ' + repr(commands))
        print('PASS real controls: independent literal commands, unavailable Cancel, stale-state refusal, safe End voice and panel fit.')
finally:
    if runtime.exists():
        shutil.rmtree(runtime)
