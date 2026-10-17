"""Actual Omarchy answer reader with synthetic owner state and clipboard data.

No audio, providers, real controls or external URLs. Clipboard bytes are kept
only in memory and restored after the check; never printed or written to disk.
"""
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
name = 'answer-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
process = None
clipboard_type = None
clipboard_bytes = None
try:
    types = subprocess.run(['wl-paste', '--list-types'], capture_output=True, timeout=3)
    if types.returncode == 0:
        offered = types.stdout.decode().splitlines()
        clipboard_type = next((item for item in offered if item.startswith('text/plain')), offered[0] if offered else None)
        if clipboard_type:
            clipboard_bytes = subprocess.check_output(['wl-paste', '--no-newline', '--type', clipboard_type], timeout=3)
    subprocess.run(['wl-copy', 'synthetic-clipboard-unchanged'], check=True, timeout=3)
    with tempfile.TemporaryDirectory(prefix='voice-answer-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'HoldPanel.qml', 'AnswerPanel.qml', 'AnswerText.js',
                         'DestinationPicker.qml', 'ActionCards.qml', 'VoiceOrb.qml',
                         'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        script = '''
import {EngineOwner} from OWNER;
import {createState} from STATE;
const native=await createState(RUNTIME);
const owner=new EngineOwner({native,session:{close:async()=>{}},
  getDestination:()=>({destination:{id:'default',label:'Synthetic context',agent:'Synthetic agent',target:'Synthetic node',state:'ready'}}),
  launch:async()=>({start:async()=>{},close:async()=>{}})});
const states=[],take=()=>states.push(native.get());
await owner.start();owner.talk({type:'session.ready'});owner.telemetry({active:true,captureReady:true,input:0,output:0});
owner.talk({type:'output.text.delta',seq:1,payload:{text:'Synthetic partial 😀'}});take();
const full='Synthetic introduction 😀\\n'+'Long line '+ 'x'.repeat(400)+'\\n'+
  'Synthetic body line.\\n'.repeat(200)+'```js\\nconst n = 1;\\n```\\n'+
  '<b>Literal markup</b> [Source](https://example.com/doc).\\nFinal line.';
owner.talk({type:'output.text.done',seq:2,payload:{text:full}});take();
await owner.stop();take();owner.dismissResult();take();
await owner.start();owner.talk({type:'output.text.delta',seq:1,payload:{text:'x'.repeat(70000)}});await owner.stop('Synthetic failure');take();
await owner.start();take();await owner.stop();await native.close();console.log(JSON.stringify(states));
'''.replace('OWNER', json.dumps((source / 'src/engine-owner.mjs').as_uri())).replace(
            'STATE', json.dumps((source / 'src/state.mjs').as_uri())).replace('RUNTIME', json.dumps(str(runtime)))
        generated = subprocess.run(['node', '--input-type=module', '-e', script], check=True,
                                   capture_output=True, text=True, timeout=10)
        states = json.loads(generated.stdout)
        receipt = root / 'unexpected-control'
        control = root / 'control'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nPath(' + repr(str(receipt)) + ').touch()\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import QtTest as QtTest
import Quickshell
import "plugin" as Voice
ShellRoot {
  QtTest.TestCase { id: input; name: "SyntheticAnswerInput"; when: false }
  Voice.VoiceIndicator { id: indicator; voiceInstance: NAME; voiceControl: CONTROL }
  Voice.AnswerPanel { id: links; current: true; voiceState: ({answer:{text:"[Source](https://example.com/doc)."}})
    property var opened: []; onLinkRequested: url => opened.push(url) }
  property var expected: STATES
  property int index: 0
  property int phase: 0
  function findText(item, text) {
    if(item.text===text)return item;
    for(const child of item.children||[]){const found=findText(child,text);if(found)return found;}
    return null;
  }
  Timer { interval: 120; running: true; repeat: true; onTriggered: {
    const panel=indicator.answerPanel, state=indicator.controlsState;
    if (state.fixtureIndex !== index) return;
    const wanted=expected[index];
    if (phase === 0) {
      if (state.answer.text !== wanted.answer.text || panel.answerText !== wanted.answer.text) return;
      if (index === 0) {
        indicator.voiceControls.visible=true;
      }
      if (index === 1) {
        if (panel.editor.textFormat !== TextEdit.PlainText || !panel.editor.text.includes("<b>Literal markup</b>")) throw Error("Markup was interpreted");
        panel.height=380; panel.width=350;
        panel.resizeText(100); if(panel.textSize!==24) throw Error("Text size upper bound");
        panel.resizeText(-100); if(panel.textSize!==12) throw Error("Text size lower bound");
        panel.resizeText(3);
      }
      if (index === 2 && (!panel.answer.complete || panel.destinationText.indexOf("Synthetic agent") < 0 || state.callRequested)) throw Error("End changed answer/context");
      if (index === 3 && (panel.answerText || panel.copyAll())) throw Error("Dismiss retained answer");
      if (index === 4 && (!panel.answer.truncated || !panel.answerStatus.startsWith("Truncated") || panel.answerText.length !== 65536)) throw Error("Overflow hidden");
      if (index === 5 && panel.answerText) throw Error("New call retained old answer");
      phase=1; return;
    }
    if(index===0&&phase===1){
      const entry=findText(indicator.voiceControls.contentItem,"Open answer");
      if(!entry)throw Error("Open answer entry missing");
      const touch=input.touchEvent(entry);
      touch.press(0,entry,entry.width/2,entry.height/2).commit();
      touch.release(0,entry,entry.width/2,entry.height/2).commit();
      phase=2;return;
    }
    if(index===0&&phase===2){
      if (!panel.visible || indicator.voiceControls.visible || !panel.answerStatus.startsWith("Partial")) throw Error("Explicit touch opening failed");
      if (links.openLink("file:///tmp/a") || links.openLink("javascript:alert(1)") || links.openLink("https://example.com/other")) throw Error("Unsafe URL admitted");
      if (!links.openLink("https://example.com/doc") || links.opened.length !== 1) throw Error("Explicit web link failed");
      console.log("NO_AUTO_COPY");phase=3;return;
    }
    if (index === 1 && phase === 1) {
      if (panel.viewport.contentHeight <= panel.viewport.height || panel.viewport.height < 60) throw Error("Reader cannot scroll on short screen");
      panel.viewport.contentY=panel.viewport.contentHeight-panel.viewport.height;
      if(panel.viewport.contentY<=0)throw Error("Scroll did not move");
      panel.viewport.contentY=0;
      input.mouseDrag(panel.editor,3,10,120,0,Qt.LeftButton,Qt.NoModifier,20);
      if(!panel.editor.selectedText)throw Error("Pointer drag could not select text");
      if(CAPTURE_PATH!=="")panel.contentItem.children[0].grabToImage(result=>result.saveToFile(CAPTURE_PATH));
      if(!panel.copyAll())throw Error("Copy all unavailable");
      console.log("COPIED_ALL"); phase=2; return;
    }
    if (index === 1 && phase === 2) {
      if(state.clipboardAck!==1)return;
      panel.editor.select(0,25);
      if(!panel.copySelection())throw Error("Copy selection unavailable");
      console.log("COPIED_SELECTION"); phase=3; return;
    }
    if (index === 1 && phase === 3) {
      if(state.clipboardAck!==2)return;
      panel.editor.forceActiveFocus();console.log("KEYBOARD_READY");phase=4;return;
    }
    if (index === 1 && phase === 4 && panel.visible) return;
    if (index === 2 && phase === 1) {
      panel.visible=true;panel.current=false;
      if(panel.answerText||panel.copyAll()||panel.copySelection()||panel.openLink("https://example.com/doc"))throw Error("Stale state exposed content/actions");
      panel.current=true;
      phase=2;return;
    }
    if (index === 2 && phase === 2) {
      const button=panel.actions.children.find(item=>item.text==="A+");
      const touch=input.touchEvent(button);
      touch.press(0,button,button.width/2,button.height/2).commit();
      touch.release(0,button,button.width/2,button.height/2).commit();
      phase=3;return;
    }
    if (index === 2 && phase === 3) {
      if(panel.textSize!==16)throw Error("Touch text sizing failed");
      const button=panel.actions.children.find(item=>item.text==="Close");
      const touch=input.touchEvent(button);
      touch.press(0,button,button.width/2,button.height/2).commit();
      touch.release(0,button,button.width/2,button.height/2).commit();
      phase=4;return;
    }
    if(index===2&&phase===4&&panel.visible)throw Error("Touch close failed");
    console.log("ANSWER_STAGE "+index);index++;phase=0;
    if(index===expected.length){console.log("ANSWER_QML_PASS");Qt.quit();}
  } }
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control))).replace('STATES', json.dumps(states)).replace('CAPTURE_PATH', json.dumps(capture))
        (root / 'shell.qml').write_text(qml)
        log = root / 'renderer.log'

        def wait_for(marker):
            deadline = time.monotonic() + 8
            while marker not in log.read_text():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError('Answer renderer failed: ' + log.read_text())
                time.sleep(0.01)

        def publish(state, index, ack=0):
            temporary = runtime / 'state.json.tmp'
            temporary.write_text(json.dumps({**state, 'updated': time.time(), 'fixtureIndex': index, 'clipboardAck': ack}))
            temporary.replace(runtime / 'state.json')

        def expect_clipboard(expected):
            # QML returns before Wayland has necessarily published ownership.
            deadline = time.monotonic() + 3
            while subprocess.check_output(['wl-paste', '--no-newline'], timeout=3) != expected:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Clipboard did not publish the expected synthetic text.')
                time.sleep(0.025)

        with log.open('w') as stream:
            process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                       stdout=stream, stderr=subprocess.STDOUT, text=True)
            for index, state in enumerate(states):
                publish(state, index)
                if index == 0:
                    wait_for('NO_AUTO_COPY')
                    assert subprocess.check_output(['wl-paste', '--no-newline'], timeout=3) == b'synthetic-clipboard-unchanged'
                if index == 1:
                    wait_for('COPIED_ALL')
                    expect_clipboard(state['answer']['text'].encode())
                    publish(state, index, 1)
                    wait_for('COPIED_SELECTION')
                    # QML selection indices use UTF-16, including the emoji pair.
                    selected = state['answer']['text'].encode('utf-16-le')[:50].decode('utf-16-le')
                    expect_clipboard(selected.encode())
                    publish(state, index, 2)
                    wait_for('KEYBOARD_READY')
                    subprocess.run(['wtype', '-M', 'ctrl', '-k', 'a', '-m', 'ctrl', '-M', 'ctrl', '-k', 'c', '-m', 'ctrl'], check=True, timeout=3)
                    deadline = time.monotonic() + 3
                    while subprocess.check_output(['wl-paste', '--no-newline'], timeout=3).decode() != state['answer']['text']:
                        if time.monotonic() >= deadline:
                            raise RuntimeError('Keyboard copy did not produce the synthetic answer: ' + log.read_text())
                        time.sleep(0.025)
                    subprocess.run(['wtype', '-k', 'Escape'], check=True, timeout=3)
                wait_for('ANSWER_STAGE ' + str(index))
            process.wait(timeout=5)
        output = log.read_text()
        if process.returncode or receipt.exists() or 'ANSWER_QML_PASS' not in output or (capture and not Path(capture).is_file()) or any(
                word in output for word in ('ReferenceError', 'TypeError', 'Failed to load configuration', 'Binding loop')):
            raise RuntimeError(output)
        print('PASS actual Omarchy answer reader: owner streaming/final/retained/overflow state, literal markup, explicit safe links, short-screen scrolling, pointer selection, touch sizing/Close, clipboard all/selection, real Ctrl+A/C/Escape, stale/dismiss/new-call boundaries; no audio/control/URL launch.')
finally:
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    if clipboard_type and clipboard_bytes is not None:
        subprocess.run(['wl-copy', '--type', clipboard_type], input=clipboard_bytes, check=True, timeout=3)
    else:
        subprocess.run(['wl-copy', '--clear'], check=True, timeout=3)
    if runtime.exists():
        shutil.rmtree(runtime)
