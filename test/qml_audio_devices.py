"""Actual Omarchy audio setup, synthetic inventory/owners and fake controls."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid

if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
    raise SystemExit('Run in Omarchy. No audio devices or providers are used.')
source = Path(__file__).resolve().parents[1]
name = 'audio-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
capture = os.environ.get('OPENCLAW_VOICE_QML_CAPTURE', '')
process = None
try:
    with tempfile.TemporaryDirectory(prefix='voice-audio-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'HoldPanel.qml', 'AnswerPanel.qml', 'AnswerText.js',
                         'DestinationPicker.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        script = '''
import {AudioDevices,deviceId} from DEVICES;
import {EngineOwner} from OWNER;
import {createState} from STATE;
const native=await createState(RUNTIME);let owner,time=0;
const data={input:[{name:'fixture-mic-a',label:'Synthetic <b>microphone</b>'},{name:'fixture-mic-b',label:'Synthetic <b>microphone</b>'}],
 output:[{name:'fixture-speaker',label:'Synthetic speaker'}],defaults:{input:'fixture-mic-a',output:'fixture-speaker'}};
const audio=new AudioDevices({path:'/unused',discover:async()=>structuredClone(data),save:async()=>{},now:()=>time,
 canUse:()=>!!owner&&!owner.requested,onChange:()=>owner?.render(),launch:async()=>({close:async()=>{}})});
owner=new EngineOwner({native,session:{close:async()=>{}},getAudio:()=>audio.snapshot(),
 launch:async()=>({start:async()=>{},close:async()=>{}})});
const states=[],take=()=>states.push(native.get());
await audio.refresh();owner.render();take();
await audio.select('input',deviceId('fixture-mic-b'));take();
await audio.startCheck('speaker');take();await audio.stopCheck();
await owner.start();take();await owner.stop();
data.output=[];await audio.refresh();owner.render();take();
time=11000;audio.tick();owner.render();take();
await native.close();console.log(JSON.stringify(states));
'''.replace('DEVICES', json.dumps((source / 'src/audio-devices.mjs').as_uri())).replace(
            'OWNER', json.dumps((source / 'src/engine-owner.mjs').as_uri())).replace(
            'STATE', json.dumps((source / 'src/state.mjs').as_uri())).replace('RUNTIME', json.dumps(str(runtime)))
        result = subprocess.run(['node', '--input-type=module', '-e', script], capture_output=True, text=True, check=True, timeout=10)
        states = json.loads(result.stdout)
        receipt = root / 'commands.jsonl'
        control = root / "fake control 'literal;args'"
        control.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\nwith Path(' + repr(str(receipt)) + ').open("a") as out: out.write(json.dumps(sys.argv[1:])+"\\n")\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import QtTest as QtTest
import Quickshell
import "plugin" as Voice
ShellRoot {
 QtTest.TestCase{id:input;name:"SyntheticAudioSetup";when:false}
 Voice.VoiceIndicator{id:indicator;voiceInstance:NAME;voiceControl:CONTROL}
 property int index:0
 property int phase:0
 function touch(button){const event=input.touchEvent(button);event.press(0,button,button.width/2,button.height/2).commit();event.release(0,button,button.width/2,button.height/2).commit();}
 Timer{interval:150;running:true;repeat:true;onTriggered:{
  const state=indicator.controlsState,panel=indicator.audioPanel;
  if(state.fixtureIndex!==index)return;
  if(phase===0){
   if(JSON.stringify(panel.audio)!==JSON.stringify(state.audio))return;
   if(index===0){indicator.voiceControls.showAudio();panel.width=340;panel.height=360;phase=1;return;}
   if(index===1){
    if(panel.inputSelector.model[panel.inputSelector.currentIndex].id!==state.audio.inputId)throw Error("Saved selection not shown");
    if(CAPTURE!=="")panel.contentItem.children[0].grabToImage(result=>result.saveToFile(CAPTURE));
    panel.viewport.contentY=panel.viewport.contentHeight-panel.viewport.height;phase=1;return;
   }
   if(index===2){
    if(indicator.activationState!=="Local audio check"||panel.inputSelector.enabled||panel.choose("input",1)||panel.invoke("audio-speaker-check"))throw Error("Active tone ownership guard failed");
    panel.busy=true;touch(panel.stopControl);phase=1;return;
   }
   if(index===3){panel.busy=false;panel.visible=true;if(panel.choose("input",1)||panel.invoke("audio-speaker-check"))throw Error("Call allowed a device change/check");}
   if(index===4&&(panel.audio.outputAvailable||panel.playControl.enabled||panel.invoke("audio-speaker-check")))throw Error("Missing output silently fell back");
   if(index===5){panel.current=false;if(panel.choose("input",1)||panel.invoke("audio-speaker-check")||panel.invoke("audio-devices"))throw Error("Stale panel became active");}
   phase=9;
  }
  if(index===0&&phase===1){
   if(panel.busy)return;
   if(panel.inputSelector.model[1].label!==panel.inputSelector.model[2].label||panel.inputSelector.model[1].detail===panel.inputSelector.model[2].detail)throw Error("Duplicate labels are ambiguous");
   if(panel.viewport.contentHeight<=panel.viewport.height||panel.viewport.height<60)throw Error("Small-screen setup cannot scroll");
   input.mouseClick(panel.inputSelector,panel.inputSelector.width/2,panel.inputSelector.height/2);
   console.log("AUDIO_KEYBOARD_SELECT");phase=2;return;
  }
  if(index===0&&phase===2){if(state.uiAck!==1)return;phase=9;}
  if(index===1&&phase===1){if(panel.busy)return;touch(panel.playControl);console.log("AUDIO_PLAY_TOUCH");phase=2;return;}
  if(index===1&&phase===2){if(state.uiAck!==1)return;phase=9;}
  if(index===2&&phase===1){if(state.uiAck!==1)return;touch(panel.closeControl);phase=2;return;}
  if(index===2&&phase===2){if(panel.visible)throw Error("Touch Close failed");if(state.uiAck!==2)return;phase=9;}
  if(phase===9){console.log("AUDIO_STAGE "+index);index++;phase=0;if(index===6){console.log("AUDIO_QML_PASS");Qt.quit();}}
 }}
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control))).replace('CAPTURE', json.dumps(capture))
        (root / 'shell.qml').write_text(qml)
        log = root / 'renderer.log'

        def commands():
            return [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []

        def wait_for(predicate):
            deadline = time.monotonic() + 8
            while not predicate():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('Audio QML failed: ' + log.read_text() + '\nCommands: ' + repr(commands()))
                time.sleep(0.02)

        def publish(state, index, ack=0):
            temporary = runtime / 'state.json.tmp'
            temporary.write_text(json.dumps({**state, 'fixtureIndex': index, 'uiAck': ack, 'updated': time.time()}))
            temporary.replace(runtime / 'state.json')

        with log.open('w') as stream:
            process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'], stdout=stream, stderr=subprocess.STDOUT, text=True)
            for index, state in enumerate(states):
                publish(state, index)
                if index == 0:
                    wait_for(lambda: 'AUDIO_KEYBOARD_SELECT' in log.read_text())
                    subprocess.run(['wtype', '-k', 'End', '-k', 'Return'], check=True, timeout=3)
                    expected = ['select-audio-device', 'input', states[1]['audio']['inputId']]
                    wait_for(lambda: expected in commands())
                    assert not any(row[0] == 'audio-speaker-check' for row in commands())
                    publish(state, index, 1)
                if index == 1:
                    wait_for(lambda: ['audio-speaker-check'] in commands())
                    publish(state, index, 1)
                if index == 2:
                    wait_for(lambda: commands().count(['audio-stop-check']) >= 1)
                    publish(state, index, 1)
                    wait_for(lambda: commands().count(['audio-stop-check']) >= 2)
                    publish(state, index, 2)
                wait_for(lambda: 'AUDIO_STAGE ' + str(index) in log.read_text())
            process.wait(timeout=5)
        output = log.read_text()
        if process.returncode or 'AUDIO_QML_PASS' not in output or any(word in output for word in ('ReferenceError', 'TypeError', 'Failed to load configuration', 'Binding loop')):
            raise RuntimeError(output)
        assert all(row[0] in ('audio-devices', 'select-audio-device', 'audio-speaker-check', 'audio-stop-check') for row in commands()), commands()
        assert commands().count(['audio-speaker-check']) == 1
        assert not capture or Path(capture).is_file()
        print('PASS actual Omarchy audio setup: synthetic owner/state, duplicate labels, literal keyboard selection, explicit touch tone/Stop/Close, stop while busy, call/tone/stale/unavailable guards and short-screen scrolling; fake controls only, no audio/provider.')
finally:
    if process and process.poll() is None:
        process.terminate(); process.wait(timeout=5)
    if runtime.exists():
        shutil.rmtree(runtime)
