"""Actual Omarchy hold controls with synthetic states and a fake launcher."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid

if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
    raise SystemExit('Run in Omarchy. This check opens no audio or provider.')
source = Path(__file__).resolve().parents[1]
name = 'hold-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
process = None
try:
    with tempfile.TemporaryDirectory(prefix='voice-hold-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'HoldPanel.qml', 'AnswerPanel.qml', 'AnswerText.js',
                         'DestinationPicker.qml', 'ActionCards.qml', 'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        receipt = root / 'commands.jsonl'
        control = root / "fake control 'literal;args'"
        control.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\nwith Path(' + repr(str(receipt)) + ').open("a") as out: out.write(json.dumps(sys.argv[1:])+"\\n")\n')
        control.chmod(0o700)
        script = '''
import { EngineOwner } from OWNER;
import { HoldInput } from HOLD;
import { createState } from STATE;
const native = await createState(RUNTIME);
let hold;
const owner = new EngineOwner({native,session:{close:async()=>{}},getHold:()=>hold?.snapshot(),
 launch:async()=>({start:async()=>{},close:async()=>{},holdInput(){}})});
hold = new HoldInput({owner});
owner.render(); const states=[native.get()];
const token='a'.repeat(16); hold.press(token); await owner.startup;
owner.talk({type:'session.ready'});
owner.telemetry({active:true,captureReady:true,muted:true}); hold.tick();
owner.telemetry({active:true,captureReady:true,muted:false}); states.push(native.get());
hold.release(token); owner.telemetry({active:true,captureReady:true,muted:true,output:0.5});
owner.talk({type:'output.text.done',seq:1,payload:{text:'Synthetic reply after release.'}});
states.push(native.get()); await owner.stop(); await native.close(); console.log(JSON.stringify(states));
'''.replace('OWNER', json.dumps((source / 'src/engine-owner.mjs').as_uri())).replace(
            'HOLD', json.dumps((source / 'src/hold-input.mjs').as_uri())).replace(
            'STATE', json.dumps((source / 'src/state.mjs').as_uri())).replace('RUNTIME', json.dumps(str(runtime)))
        generated = subprocess.run(['node', '--input-type=module', '-e', script],
                                   check=True, capture_output=True, text=True, timeout=10)
        states = json.loads(generated.stdout)
        qml = '''import QtQuick
import QtTest as Test
import Quickshell
import "plugin" as Voice
ShellRoot {
 Test.TestCase {id:input;name:"SyntheticHold";when:false}
 Voice.VoiceIndicator {id:indicator;voiceInstance:NAME;voiceControl:CONTROL}
 property int phase:0
 property int waits:0
 Timer {interval:200;running:true;repeat:true;onTriggered:{
  const panel=indicator.holdPanel,state=indicator.controlsState;
  if(state.fixtureIndex===undefined)return;
  if(phase===0){
   if(indicator.holdShortcut.active||panel.held)throw Error("Hold shortcut/input enabled implicitly");
   indicator.voiceControls.showHold();panel.width=330;panel.height=350;
   phase=1;return;
  }
  if(phase===1){if(!panel.focusArea.activeFocus||!panel.canBegin)return;console.log("HOLD_KEY_READY");phase=2;return;}
  if(phase===2&&state.fixtureIndex===1){
   if(!panel.held||!panel.hold.ready)throw Error("Readiness not shown for held key");
   console.log("HOLD_RELEASE_KEY");phase=3;return;
  }
  if(phase===3&&state.fixtureIndex===2){
   if(panel.held||indicator.activationState!=="Input muted")throw Error("Keyboard release did not clear press");
   if(indicator.conversation.replyWords!=="Synthetic reply after release."||!indicator.conversation.conversationVisible){
    if(++waits<10)return;
    throw Error("Continuing reply captions hidden after hold release");
   }
   waits=0;
   input.touchEvent(panel.holdButton).press(0,panel.holdButton,40,40).commit();
   if(!panel.held)throw Error("Touch press did not begin hold");phase=4;return;
  }
  if(phase===4){
   input.touchEvent(panel.holdButton).release(0,panel.holdButton,40,40).commit();
   if(panel.held)throw Error("Touch release stuck");phase=5;return;
  }
  if(phase===5){if(panel.busy)return;panel.begin("touch");panel.holdArea.canceled();if(panel.held)throw Error("Touch cancel stuck");phase=6;return;}
  if(phase===6){if(panel.busy)return;panel.begin("keyboard");panel.focusArea.focus=false;if(panel.held)throw Error("Focus loss stuck");phase=7;return;}
  if(phase===7){if(panel.busy)return;panel.begin("touch");panel.visible=false;if(panel.held)throw Error("Close stuck");indicator.holdShortcutEnabled=true;phase=8;return;}
  if(phase===8){
   if(panel.busy||!indicator.holdShortcut.item)return;
   indicator.holdShortcut.item.onPressed();
   if(!panel.held)throw Error("Opt-in global press did not begin hold");
   indicator.holdShortcut.item.onPressed();
   indicator.holdShortcut.item.onReleased();
   if(panel.held)throw Error("Global release stuck");phase=9;return;
  }
  if(phase===9){
   if(panel.busy)return;panel.visible=true;panel.current=false;
   if(panel.begin("touch"))throw Error("Stale state allowed hold");
   panel.current=true;panel.voiceState=Object.assign({},state,{reviewRequired:true,callRequested:false,hold:{mode:false}});
   if(panel.begin("keyboard"))throw Error("Result review boundary bypassed");
   panel.voiceState=Object.assign({},state,{status:"standby",callRequested:false,hold:{mode:false}});
   if(panel.begin("touch"))throw Error("Wake replaced without End voice");
   panel.voiceState=Object.assign({},state,{callRequested:true,hold:{mode:false}});
   if(panel.begin("touch"))throw Error("Conversation replaced without End voice");
   console.log("HOLD_QML_PASS");Qt.quit();
  }
 }}
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control)))
        (root / 'shell.qml').write_text(qml)
        runtime.mkdir(mode=0o700, exist_ok=True)
        (runtime / 'level').write_text('0 0')
        log = root / 'renderer.log'

        def commands():
            return [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []

        def publish(index):
            state = {**states[index], 'updated': time.time(), 'fixtureIndex': index}
            temp = runtime / 'state.json.tmp'
            temp.write_text(json.dumps(state)); temp.replace(runtime / 'state.json')

        def wait_for(predicate):
            deadline = time.monotonic() + 8
            while not predicate():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('Hold QML failed: ' + log.read_text() + '\nCommands: ' + repr(commands()))
                time.sleep(0.02)

        publish(0)
        with log.open('w') as stream:
            process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'], stdout=stream, stderr=subprocess.STDOUT)
            wait_for(lambda: 'HOLD_KEY_READY' in log.read_text())
            assert not commands(), commands()
            time.sleep(0.4)  # Let the compositor acknowledge exclusive keyboard focus.
            keyboard = subprocess.Popen(['wtype', '-P', 'space', '-s', '2500', '-p', 'space'])
            wait_for(lambda: any(row[0] == 'hold-renew' for row in commands()))
            assert len([row for row in commands() if row[0] == 'hold-start']) == 1
            publish(1); wait_for(lambda: 'HOLD_RELEASE_KEY' in log.read_text())
            keyboard.wait(timeout=4)
            wait_for(lambda: any(row[0] == 'hold-release' for row in commands()))
            publish(2)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired as error:
                raise RuntimeError('Hold QML did not finish: ' + log.read_text()) from error
        output = log.read_text()
        if process.returncode or 'HOLD_QML_PASS' not in output or any(word in output for word in ('ReferenceError', 'TypeError', 'Failed to load configuration', 'Binding loop')):
            raise RuntimeError(output)
        starts = [row[1] for row in commands() if row[0] == 'hold-start']
        releases = [row[1] for row in commands() if row[0] == 'hold-release']
        assert len(starts) >= 6 and len(starts) == len(set(starts)) and set(starts) <= set(releases), commands()
        assert all(len(row) == 2 and row[0] in ('hold-start', 'hold-renew', 'hold-release') for row in commands())
        print('PASS actual Omarchy hold controls: real keyboard, simulated touch, cancel/focus/Close release, opt-in shortcut events, literal tokens, readiness, continuing reply captions through real owner/state, small layout and mode/review/stale guards; fake controls only.')
finally:
    if process and process.poll() is None:
        process.terminate(); process.wait(timeout=5)
    if runtime.exists():
        shutil.rmtree(runtime)
