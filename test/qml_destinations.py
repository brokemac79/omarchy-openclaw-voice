"""Actual Omarchy renderer with discovered synthetic destinations; no audio."""
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
name = 'destination-' + uuid.uuid4().hex[:12]
runtime = Path(os.environ['XDG_RUNTIME_DIR']) / ('openclaw-voice-' + name)
process = None
try:
    with tempfile.TemporaryDirectory(prefix='voice-destination-qml-') as directory:
        root = Path(directory)
        for module in ('Commons', 'Ui', 'services'):
            (root / module).symlink_to(Path('/usr/share/omarchy/shell') / module, target_is_directory=True)
        (root / 'plugin').mkdir()
        for filename in ('VoiceIndicator.qml', 'VoiceControls.qml', 'AudioPanel.qml', 'AnswerPanel.qml', 'AnswerText.js', 'DestinationPicker.qml', 'ActionCards.qml',
                         'VoiceOrb.qml', 'TranscriptBubble.qml', 'Instance.js', 'openclaw-voice.svg'):
            shutil.copyfile(source / filename, root / 'plugin' / filename)
        script = '''
import {EngineOwner} from OWNER;
import {createState} from STATE;
import {Destinations,destinationPresets} from DESTINATIONS;
const native=await createState(RUNTIME); let owner;
const data={agents:[{id:'alpha',name:'Synthetic Alpha'},{id:'beta',name:'Synthetic Beta'}],
  sessions:[{key:'agent:alpha:main',agentId:'alpha'},{key:'agent:beta:work',agentId:'beta',execNode:'fixture-node'}],
  nodes:[{nodeId:'fixture-node',displayName:'Synthetic workstation',connected:true,paired:true}]};
const rpc=async(method,params={})=>{
  if(method==='agents.list')return {agents:data.agents,defaultId:'beta'};
  if(method==='node.list')return {nodes:data.nodes};
  if(method==='sessions.resolve'){const row=data.sessions.find(row=>row.key===params.key);return row?{ok:true,key:row.key,agentId:row.agentId}:{ok:false};}
  if(method==='sessions.list')return {sessions:data.sessions.filter(row=>row.key===params.search)};
  throw Error('Unexpected fixture RPC');
};
const destinations=new Destinations({rpc,path:SELECTION,presets:destinationPresets({sessionKey:'agent:alpha:main',
  destinations:[{id:'work',label:'Synthetic <b>work</b>',sessionKey:'agent:beta:work',nodeId:'fixture-node'}]}),
  canSwitch:()=>!!owner&&!owner.requested&&!owner.reviewRequired,onChange:()=>owner?.render()});
owner=new EngineOwner({native,session:{close:async()=>{}},getDestination:()=>destinations.snapshot(),
  onStopped:()=>destinations.endCall(),launch:async()=>({start:async()=>{},close:async()=>{}})});
await destinations.load();destinations.setConnected(true);await destinations.refresh();owner.render();
const states=[],take=()=>states.push(native.get());take();
await destinations.select('work');take();
await owner.start();owner.talk({type:'output.text.done',seq:1,turnId:'fixture-turn',payload:{text:'Synthetic previous outcome.'}});
await owner.stop();take();
try{await destinations.select('configured');throw Error('Review was bypassed');}catch(error){if(error.code!=='destination_switch_blocked')throw error;}
owner.dismissResult();await destinations.select('configured');take();
data.agents=data.agents.filter(agent=>agent.id!=='alpha');await destinations.refresh();take();
destinations.setConnected(false);take();await native.close();console.log(JSON.stringify(states));
'''.replace('OWNER', json.dumps((source / 'src/engine-owner.mjs').as_uri())).replace(
            'STATE', json.dumps((source / 'src/state.mjs').as_uri())).replace(
            'DESTINATIONS', json.dumps((source / 'src/destinations.mjs').as_uri())).replace(
            'RUNTIME', json.dumps(str(runtime))).replace('SELECTION', json.dumps(str(root / 'selection/destination.json')))
        generated = subprocess.run(['node', '--input-type=module', '-e', script],
                                   capture_output=True, text=True, check=True, timeout=10)
        states = json.loads(generated.stdout)
        receipt = root / 'argv.jsonl'
        control = root / "control 'literal;args'"
        control.write_text('#!/usr/bin/python3\nimport json,sys\nfrom pathlib import Path\n'
                           'with Path(' + repr(str(receipt)) + ').open("a") as out: out.write(json.dumps(sys.argv[1:])+"\\n")\n')
        control.chmod(0o700)
        qml = '''import QtQuick
import Quickshell
import "plugin" as Voice
ShellRoot {
  Voice.VoiceIndicator {id:indicator;voiceInstance:NAME;voiceControl:CONTROL}
  property var expected:STATES
  property int index:0
  Timer {interval:80;running:true;repeat:true;onTriggered:{
    const state=indicator.controlsState,panel=indicator.voiceControls,view=indicator.conversation;
    if(state.fixtureIndex!==index||view.destinationText.indexOf(expected[index].destination.label)<0)return;
    const wanted=expected[index];
    if(JSON.stringify(state.destination)!==JSON.stringify(wanted.destination))throw Error("Destination state mismatch");
    panel.visible=true;
    if(index===0){
      if(!indicator.destinationText.includes("Synthetic Alpha")||!panel.chooseDestination("work")
        ||panel.chooseDestination("../bad")||panel.invoke("toggle"))throw Error("Preset command isolation failed");
    }
    if(index===1&&(!indicator.destinationText.includes("Synthetic Beta")||state.destination.target!=="Synthetic workstation"))throw Error("Selected agent/node label missing");
    if(index===2&&(panel.chooseDestination("configured")||state.lastResult!=="Synthetic previous outcome."||!state.reviewRequired))throw Error("Switch hid an unknown outcome");
    if(index===3&&(state.lastResult||state.reviewRequired||state.destination.id!=="configured"))throw Error("Review boundary failed");
    if(index===4&&(!indicator.destinationText.startsWith("Unavailable")||panel.chooseDestination("configured")))throw Error("Unavailable selection fell back");
    if(index===5&&(!indicator.destinationText.startsWith("Stale")||panel.chooseDestination("work")))throw Error("Stale selection was usable");
    if(panel.implicitHeight>620||indicator.implicitWidth>230)throw Error("Destination UI exceeds compact bounds");
    console.log("DESTINATION_STAGE "+index);index++;
    if(index===expected.length){console.log("DESTINATION_QML_PASS");Qt.quit();}
  }}
}'''.replace('NAME', json.dumps(name)).replace('CONTROL', json.dumps(str(control))).replace('STATES', json.dumps(states))
        (root / 'shell.qml').write_text(qml)
        log = root / 'renderer.log'
        with log.open('w') as stream:
            process = subprocess.Popen(['quickshell', '--path', str(root / 'shell.qml'), '--no-color'],
                                       stdout=stream, stderr=subprocess.STDOUT, text=True)
            for index, state in enumerate(states):
                temporary = runtime / 'state.json.tmp'
                temporary.write_text(json.dumps({**state, 'updated': time.time(), 'fixtureIndex': index}))
                temporary.replace(runtime / 'state.json')
                deadline = time.monotonic() + 5
                while 'DESTINATION_STAGE ' + str(index) not in log.read_text():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        raise RuntimeError('Destination renderer failed: ' + log.read_text())
                    time.sleep(0.025)
            process.wait(timeout=5)
        output = log.read_text()
        commands = [json.loads(line) for line in receipt.read_text().splitlines()] if receipt.exists() else []
        if (process.returncode or 'DESTINATION_QML_PASS' not in output or commands != [['select-destination', 'work']]
                or any(word in output for word in ('ReferenceError', 'TypeError', 'Failed to load configuration'))):
            raise RuntimeError(output + repr(commands))
        print('PASS Omarchy destinations: persistent agent/node labels, literal selection argv, unavailable/stale refusal, review boundary and compact bounds; no audio.')
finally:
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    if runtime.exists():
        shutil.rmtree(runtime)
