"""Omarchy renderer with synthetic Talk events through the owner/state writer."""
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
name = 'actions-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
process = None
try:
    with tempfile.TemporaryDirectory(prefix='voice-actions-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'ActionCards.qml', 'VoiceOrb.qml',
                         'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        script = '''
import { EngineOwner } from OWNER;
import { createState } from STATE;
const native = await createState(RUNTIME);
const owner = new EngineOwner({ native, session: {close: async()=>{}},
  launch: async()=>({start:async()=>{},close:async()=>{},quiet(){}}) });
const states = [], take = () => states.push(native.get());
await owner.start(); owner.talk({type:'session.ready'});
owner.telemetry({active:true,captureReady:true,input:0,output:0});
owner.talk({type:'transcript.done',seq:1,turnId:'fixture-first',payload:{text:'Synthetic request.'}}); take();
owner.talk({type:'output.text.delta',seq:2,turnId:'fixture-first',payload:{text:'Synthetic acknowledgment.'}}); take();
owner.talk({type:'output.text.done',seq:3,turnId:'fixture-first',payload:{text:'Synthetic final text.'}});
owner.talk({type:'turn.ended',seq:4,turnId:'fixture-first',payload:{status:'completed'}});
await owner.stop(); take();
await owner.start(); owner.talk({type:'session.ready'});
owner.telemetry({active:true,captureReady:true,input:0,output:0}); take();
for(let i=1;i<=6;i++) owner.talk({type:'transcript.done',seq:i,turnId:'fixture-'+i,payload:{text:'Synthetic request.'}});
owner.talk({type:'output.text.done',seq:7,turnId:'fixture-6',payload:{text:'Synthetic final text. '.repeat(100)}});
await owner.stop(); take(); owner.dismissResult(); take();
await native.close(); console.log(JSON.stringify(states));
'''.replace('OWNER', json.dumps((source / 'src/engine-owner.mjs').as_uri())).replace(
            'STATE', json.dumps((source / 'src/state.mjs').as_uri())).replace('RUNTIME', json.dumps(str(runtime)))
        generated = subprocess.run(['node', '--input-type=module', '-e', script],
                                   check=True, capture_output=True, text=True, timeout=10)
        states = json.loads(generated.stdout)
        receipt = root / 'unexpected-control'
        control = root / 'control'
        control.write_text('#!/usr/bin/python3\nfrom pathlib import Path\nPath(' + repr(str(receipt)) + ').touch()\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceIndicator { id: indicator; voiceInstance: NAME; voiceControl: CONTROL }
  Voice.ActionCards { id: standalone; width: 330; cards: [{number:1,status:"completed"}] }
  property var expected: STATES
  property int index: 0
  Timer { interval: 80; running: true; repeat: true; onTriggered: {
    const state = indicator.controlsState, panel = indicator.voiceControls, view = indicator.conversation;
    if (state.fixtureIndex !== index || JSON.stringify(view.actionCards) !== JSON.stringify(expected[index].actionCards)) return;
    const wanted = expected[index];
    if (JSON.stringify(state.actionCards) !== JSON.stringify(wanted.actionCards)
        || state.lastResult !== wanted.lastResult || state.workStatus !== "unknown"
        || standalone.summary !== "Voice turn 1 · Outcome unknown") throw Error("Action evidence mismatch");
    if (index === 0 && view.actionCards[0].status !== "heard") throw Error("Heard missing");
    if (index === 1 && (view.statusText !== "Responding" || view.actionCards[0].status !== "unknown")) throw Error("Speech misrepresented as work");
    if (index === 2 && (view.conversationVisible || !state.lastResult || state.actionCards[0].status !== "unknown")) throw Error("End lost fallback");
    if (index === 3 && (state.actionCards.length || state.lastResult)) throw Error("New call retained previous results");
    if (index === 4) {
      panel.visible = true;
      panel.height = 380;
      const viewport = panel.contentItem.children[0].children[0];
      if (viewport.height > 352) return;
      if (panel.implicitHeight > 620 || viewport.contentHeight <= viewport.height || state.earlierUnknown !== 2
          || viewport.contentWidth !== viewport.width || viewport.width < 300) throw Error("Results overflow is inaccessible: "
            + JSON.stringify([panel.implicitHeight,viewport.contentHeight,viewport.height,viewport.contentWidth,viewport.width,state.earlierUnknown]));
      viewport.contentY = viewport.contentHeight - viewport.height;
      if (viewport.contentY <= 0) throw Error("Results cannot scroll");
      panel.current = false;
      if (panel.invoke("quiet") || panel.invoke("mute")) throw Error("Stale controls became active");
      panel.current = true;
    }
    if (index === 5 && (state.actionCards.length || state.lastResult)) throw Error("Dismiss failed");
    console.log("ACTION_STAGE " + index); index++;
    if (index === expected.length) { console.log("ACTION_QML_PASS"); Qt.quit(); }
  } }
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control))).replace('STATES', json.dumps(states))
        (root / 'shell.qml').write_text(qml)
        log = root / 'renderer.log'
        with log.open('w') as stream:
            process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                       stdout=stream, stderr=subprocess.STDOUT, text=True)
            for index, state in enumerate(states):
                payload = {**state, 'updated': time.time(), 'fixtureIndex': index}
                temporary = runtime / 'state.json.tmp'
                temporary.write_text(json.dumps(payload))
                temporary.replace(runtime / 'state.json')
                deadline = time.monotonic() + 5
                while 'ACTION_STAGE ' + str(index) not in log.read_text():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('Action renderer failed: ' + log.read_text())
                    time.sleep(0.025)
            process.wait(timeout=5)
        output = log.read_text()
        if (process.returncode or 'ACTION_QML_PASS' not in output or receipt.exists()
                or any(word in output for word in ('ReferenceError', 'TypeError', 'Failed to load configuration'))):
            raise RuntimeError(output)
        print('PASS Omarchy action cards: owner events/state file, Heard/unknown, separate speech, retained text, bounded scroll, new call and dismiss; no audio/control invocation.')
finally:
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    if runtime.exists():
        shutil.rmtree(runtime)
