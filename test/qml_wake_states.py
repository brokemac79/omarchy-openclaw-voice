"""Actual Omarchy renderer: synthetic wake states and fake control, no audio."""
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
name = 'wakeproof-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
try:
    with tempfile.TemporaryDirectory(prefix='voice-wake-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        runtime.mkdir(mode=0o700)
        (runtime / 'state.json').write_text(json.dumps({'status': 'idle', 'text': 'Microphone off', 'updated': 1}))
        (runtime / 'level').write_text('0 0')
        receipt = root / 'unexpected-control'
        control = root / 'control'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nPath(' + repr(str(receipt)) + ').touch()\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceIndicator { id: indicator; voiceInstance: NAME; voiceControl: CONTROL }
  property var cases: [
    ["idle", "Off", false], ["standby", "Standby", true],
    ["preparing", "Preparing voice", true], ["connecting", "Connecting", true], ["listening", "Talk", true],
    ["thinking", "Talk", true], ["acting", "Talk", true], ["stopping", "Stopping", true]
  ]
  property int index: 0
  property int failures: 0
  Timer { interval: 250; running: true; repeat: true; onTriggered: {
    if (index < cases.length) {
      const c = cases[index];
      indicator.updatedAt = Date.now() / 1000;
      indicator.status = c[0];
      indicator.label = c[0] === "standby" ? "Standby: local microphone · “Hey Open Claw” · open conversation" : "Synthetic state";
      const panel = indicator.conversation;
      panel.updatedAt = Date.now() / 1000; panel.nowSeconds = panel.updatedAt;
      panel.status = c[0]; panel.label = c[0] === "listening" ? "Talk ready — Listening" : indicator.label;
      if (indicator.activationState !== c[1] || panel.awake !== c[2]) {
        console.log("FAIL state " + c[0]); failures++;
      }
      if (["standby", "preparing", "connecting", "stopping"].includes(c[0]) && panel.conversationVisible) {
        console.log("FAIL stale bubbles in " + c[0]); failures++;
      }
      if (c[0] === "standby" && panel.statusText !== "Standby · Local microphone") {
        console.log("FAIL standby label"); failures++;
      }
      if (c[0] === "connecting" && !panel.statusText.includes("Wait for Talk")) {
        console.log("FAIL readiness label"); failures++;
      }
      if (c[0] === "preparing" && !panel.statusText.startsWith("Preparing voice")) {
        console.log("FAIL preparation label"); failures++;
      }
      if (c[0] === "listening" && panel.statusText !== "Ready · Listening") {
        console.log("FAIL visual ready cue"); failures++;
      }
      if (c[0] === "listening") {
        panel.label = "Microphone muted";
        if (panel.statusText !== "Ready · Input muted") { console.log("FAIL muted readiness cue"); failures++; }
      }
      index++;
    } else {
      indicator.status = "stopped"; indicator.updatedAt = 0;
      if (indicator.activationState !== "Unknown") { console.log("FAIL missing state claims Off"); failures++; }
      indicator.conversation.updatedAt = 1;
      if (indicator.conversation.awake) { console.log("FAIL stale overlay"); failures++; }
      console.log("WAKE_QML_RESULT " + failures); Qt.quit();
    }
  } }
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control)))
        (root / 'shell.qml').write_text(qml)
        result = subprocess.run(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                capture_output=True, text=True, timeout=12)
        output = result.stdout + result.stderr
        if result.returncode or 'WAKE_QML_RESULT 0' not in output or 'FAIL ' in output or receipt.exists():
            print(output)
            raise SystemExit('Wake QML proof failed.')
        print('PASS actual Omarchy QML: Off/Standby/Connecting/Talk/Stopping/Unknown, panels, stale state and no control invocation.')
finally:
    if runtime.exists():
        shutil.rmtree(runtime)
