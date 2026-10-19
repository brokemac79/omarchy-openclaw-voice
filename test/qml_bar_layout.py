"""Real Omarchy components, synthetic bar neighbours and hover text; no audio."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
    raise SystemExit('Run in the Linux graphical session. No audio devices are used.')

source = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='voice-bar-qml-') as directory, tempfile.TemporaryDirectory(
        prefix='openclaw-voice-bar-', dir=os.environ['XDG_RUNTIME_DIR']) as runtime_directory:
    root = Path(directory)
    instance = Path(runtime_directory).name.removeprefix('openclaw-voice-')
    Path(runtime_directory, 'state.json').write_text(json.dumps({
        'status': 'idle', 'text': 'Microphone off', 'updated': time.time(),
        'destination': {'state': 'ready', 'agent': 'main', 'label': 'Configured conversation',
                        'target': 'Gateway-selected execution'}}))
    Path(runtime_directory, 'level').write_text('0')
    receipt = root / 'unexpected-control'
    control = root / 'fake-control'
    control.write_text('#!/bin/sh\ntouch "' + str(receipt) + '"\nexit 77\n')
    control.chmod(0o700)
    for module in ('Commons', 'Ui', 'services'):
        (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
    (root / 'plugin').mkdir()
    for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'HoldPanel.qml',
                     'AnswerPanel.qml', 'AnswerText.js', 'DestinationPicker.qml', 'ActionCards.qml',
                     'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
        shutil.copyfile(source / filename, root / 'plugin' / filename)
    qml = '''import QtQuick
import Quickshell
import QtTest as Test
import qs.Commons
import "plugin" as Voice
ShellRoot {
  QtObject {
    id: bar
    property bool vertical: false
    property int barSize: 26
    property string fontFamily: Style.font.family
    property color barForeground: "#ffffff"
    property color urgent: "#ffb454"
    property bool foregroundAnimationEnabled: false
    property string tooltip: ""
    function showTooltip(target, text) { tooltip = text }
    function hideTooltip(target) { tooltip = "" }
  }
  FloatingWindow {
    id: window; visible: true; implicitWidth: 1080; implicitHeight: 180; color: "#1a1b26"
    Item {
      id: scene; width: 1080; height: 180
      Rectangle { x: 488; width: 176; height: 26; color: "#383e60"
        Text { anchors.centerIn: parent; text: "Clock and centre widgets"; color: "white" }
      }
      Row {
        id: right; anchors.right: parent.right; anchors.rightMargin: 8
        Rectangle { width: 81; height: 26; color: "#383e60" }
        Voice.VoiceIndicator {
          id: indicator; bar: bar; voiceInstance: INSTANCE; voiceControl: CONTROL
          width: implicitWidth; height: implicitHeight
        }
        Rectangle { width: 262; height: 26; color: "#383e60"
          Text { anchors.centerIn: parent; text: "Other bar controls"; color: "white" }
        }
      }
      // Same unconstrained plain Text and padding as Omarchy's tooltip bubble.
      Rectangle {
        x: 650; y: 40; width: tooltipLabel.implicitWidth + 20; height: tooltipLabel.implicitHeight + 14
        color: "#282a3d"; radius: 6
        Text {
          id: tooltipLabel; anchors.centerIn: parent; text: bar.tooltip; textFormat: Text.PlainText
          color: "white"; font.family: bar.fontFamily; font.pixelSize: Style.font.body
          horizontalAlignment: Text.AlignHCenter
        }
      }
    }
  }
  Test.TestCase { id: input; name: "SyntheticBarLayout"; when: false }
  property int stage: 0
  property bool longHoverShown: false
  property var button: null
  property var destination: ({state:"ready", agent:"main", label:"Configured conversation", target:"Gateway-selected execution"})
  Timer { interval: 120; running: true; repeat: true; onTriggered: {
    try {
      if(stage===0) {
        button = indicator.children.find(child => child.tooltipText !== undefined);
        if(!button) throw Error("Bar button missing");
        indicator.controlsState = {destination:destination}; indicator.status = "idle";
        indicator.label = "Microphone off"; indicator.updatedAt = Date.now()/1000;
      } else if(stage===1) {
        if(indicator.implicitWidth>32 || right.x<664) throw Error("Default voice slot crowds centre widgets: " + indicator.implicitWidth + ", section x=" + right.x);
        input.mouseMove(button,button.width/2,button.height/2);
      } else if(stage===2) {
        if(tooltipLabel.implicitWidth>320 || tooltipLabel.lineCount>4 || tooltipLabel.lineCount<2)
          throw Error("Hover must be compact and multiline: " + tooltipLabel.implicitWidth);
        if(bar.tooltip.split("Configured conversation").length!==2) throw Error("Duplicated destination in hover");
        if(!bar.tooltip.includes("Off") || !bar.tooltip.includes("main")) throw Error("State or agent missing from hover");
        indicator.settings = {showDestinationLabel:true};
        indicator.controlsState = {destination:{state:"unavailable",agent:"Synthetic extraordinarily long agent ".repeat(12),
          label:"Synthetic label ".repeat(30),target:"Synthetic node ".repeat(30)}};
        indicator.label = "Synthetic recovery guidance ".repeat(30);
      } else if(stage===3) {
        if(indicator.implicitWidth>105) throw Error("Optional label is too wide");
        const label=indicator.children.find(child=>child.text!==undefined);
        input.mouseClick(label,label.width/2,label.height/2,Qt.RightButton);
        if(!indicator.voiceControls.visible) throw Error("Agent label right-click no longer opens controls");
        indicator.voiceControls.visible=false;
        bar.showTooltip(button,button.tooltipText);
      } else if(stage===4) {
        if(!longHoverShown) { bar.showTooltip(button,button.tooltipText); longHoverShown=true; return; }
        if(tooltipLabel.implicitWidth>320 || tooltipLabel.lineCount>4 || !bar.tooltip.includes("Unavailable"))
          throw Error("Long destination or recovery text escapes hover bounds: " + tooltipLabel.implicitWidth + ", " + bar.tooltip);
        indicator.width = 40;
      } else if(stage===5) {
        if(!indicator.clip) throw Error("Constrained slot must clip its content");
        for(const child of indicator.children) {
          if(child.visible && child.text !== undefined && child.x+child.width>indicator.width+0.1)
            throw Error("Label escapes constrained slot");
        }
        input.mouseClick(button,button.width/2,button.height/2,Qt.RightButton);
        if(!indicator.voiceControls.visible) throw Error("Right-click no longer opens controls");
        indicator.voiceControls.visible = false;
        indicator.width = Qt.binding(()=>indicator.implicitWidth); bar.vertical = true;
      } else if(stage===6) {
        if(indicator.implicitWidth!==bar.barSize || indicator.implicitHeight>32) throw Error("Vertical slot expanded");
        indicator.controlsState = {destination:{state:"stale",label:"Destination unknown"}};
        indicator.status = "error";
      } else if(stage===7) {
        if(!button.tooltipText.includes("Stale")) throw Error("Stale destination lost");
        if(CAPTURE!=="") {
          bar.vertical=false; indicator.settings={}; indicator.width=Qt.binding(()=>indicator.implicitWidth);
          indicator.controlsState={destination:destination}; indicator.status="idle"; indicator.label="Microphone off";
        }
      } else if(stage===8) {
        bar.showTooltip(button,button.tooltipText);
      } else if(stage===9) {
        if(CAPTURE!=="") {
          scene.grabToImage(result=>{if(!result.saveToFile(CAPTURE))throw Error("Capture failed"); console.log("BAR_LAYOUT_PASS");Qt.quit();});
          running=false; return;
        }
        console.log("BAR_LAYOUT_PASS"); Qt.quit();
      }
      stage++;
    } catch(error) { console.error("BAR_LAYOUT_FAIL: "+error); Qt.quit(); }
  }}
}'''.replace('CAPTURE', json.dumps(os.environ.get('VOICE_BAR_CAPTURE', ''))).replace(
        'INSTANCE', json.dumps(instance)).replace('CONTROL', json.dumps(str(control)))
    (root / 'shell.qml').write_text(qml)
    result = subprocess.run(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                            capture_output=True, text=True, timeout=20)
    output = result.stdout + result.stderr
    if receipt.exists() or result.returncode or 'BAR_LAYOUT_PASS' not in output or any(word in output for word in (
            'BAR_LAYOUT_FAIL', 'ReferenceError', 'TypeError', 'Failed to load configuration', 'Binding loop')):
        raise RuntimeError(output)
    print('PASS actual Omarchy bar: compact default, bounded multiline hover, optional/constrained/vertical labels, right-click controls; no audio.')
