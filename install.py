#!/usr/bin/env python3
"""Install user-owned files with backups; never record audio during installation."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from tools.install_files import FilePlan
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--node', default=shutil.which('node'))
args = parser.parse_args()
if not args.node or not Path(args.node).is_file():
    parser.error('Node.js is required; pass --node /path/to/node if needed.')
node = str(Path(args.node).resolve())
major = int(subprocess.check_output([node, '-p', 'process.versions.node.split(".")[0]'], text=True))
if major < 22:
    parser.error('Node.js 22 or newer is required.')
for command in ('omarchy', 'systemctl', 'hyprctl'):
    if not shutil.which(command):
        parser.error(f'{command} is required. No packages are installed by this script.')
source = Path(__file__).resolve().parent
subprocess.run(['/usr/bin/python3', str(source / 'native/audio.py'), '--check'], check=True)
home = Path.home()
config = Path(os.environ.get('XDG_CONFIG_HOME', home / '.config'))
data = Path(os.environ.get('XDG_DATA_HOME', home / '.local/share'))
state = Path(os.environ.get('XDG_STATE_HOME', home / '.local/state'))
target = data / 'openclaw-voice'
backup = state / 'openclaw-voice/backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
plan = FilePlan(backup)
put = plan.put

for directory in ('src', 'native'):
    for file in (source / directory).glob('*'):
        if file.is_file():
            put(target / directory / file.name, file.read_bytes())
# Remove only known obsolete app-owned browser assets, retaining their backups.
for old in ('src/browser.mjs', 'engine/app.js', 'engine/index.html'):
    plan.remove(target / old)
for name in ('LICENSE', 'LICENSE-OMA', 'CREDITS.md', 'package.json'):
    put(target / name, (source / name).read_bytes())
put(home / '.local/bin/openclaw-voice', (source / 'bin/openclaw-voice').read_bytes(), 0o755)
for plugin in ('openclaw-voice.orb', 'openclaw-voice.indicator'):
    for file in (source / 'plugin' / plugin).iterdir():
        if file.is_file():
            put(config / 'omarchy/plugins' / plugin / file.name, file.read_bytes())
    put(config / 'omarchy/plugins' / plugin / 'CREDITS.md', (source / 'CREDITS.md').read_bytes())

def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'

put(config / 'systemd/user/openclaw-voice.service', f'''[Unit]
Description=OpenClaw Voice - OMA interface for OpenClaw
After=graphical-session.target

[Service]
Type=simple
ExecStart={quote(node)} {quote(target / 'src/server.mjs')}
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
KillMode=control-group
UMask=0077
NoNewPrivileges=true

# Started on demand. Installing does not enable microphone capture or login startup.
''')
put(data / 'applications/openclaw-voice.desktop', f'''[Desktop Entry]
Type=Application
Name=OpenClaw Voice
Comment=Start or end your OpenClaw voice conversation
Exec="{home}/.local/bin/openclaw-voice" toggle
Icon=audio-input-microphone
Terminal=false
Categories=AudioVideo;Audio;
''')
# This file is owned by OpenClaw Voice, so it also replaces the old browser-card rule.
put(config / 'hypr/openclaw-voice.lua', f'''-- OpenClaw Voice native OMA orb; starts only on explicit invocation.
hl.unbind("SUPER + SHIFT + V")
o.bind("SUPER + SHIFT + V", "Talk to OpenClaw / end voice", {json.dumps(str(home / '.local/bin/openclaw-voice'))} .. " toggle")
''')
hypr = config / 'hypr/hyprland.lua'
text = hypr.read_text()
if 'require("hypr.openclaw-voice")' not in text:
    put(hypr, text.rstrip() + '\n\nrequire("hypr.openclaw-voice")\n')
shell = config / 'omarchy/shell.json'
if shell.exists():
    put(shell, shell.read_bytes())  # Snapshot before the supported CLI changes layout.
# Validate every destination before stopping the service or changing any file.
plan.validate()
# Refuse to overwrite a running installation if systemd cannot stop its unit.
load_state = subprocess.check_output(['systemctl', '--user', 'show', 'openclaw-voice.service',
                                      '--property=LoadState', '--value'], text=True).strip()
if load_state != 'not-found':
    subprocess.run(['systemctl', '--user', 'stop', 'openclaw-voice.service'], check=True)
plan.apply()
subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
for plugin in ('openclaw-voice.orb', 'openclaw-voice.indicator'):
    subprocess.run(['omarchy', 'plugin', 'validate', str(config / 'omarchy/plugins' / plugin)], check=True)
    subprocess.run(['omarchy', 'plugin', 'enable', plugin], check=True)
subprocess.run(['omarchy', 'bar', 'move', 'openclaw-voice.indicator', '--section', 'right'], check=True)
subprocess.run(['hyprctl', 'reload'], check=True)
errors = subprocess.check_output(['hyprctl', 'configerrors'], text=True).strip()
if errors and errors != 'ok':
    raise SystemExit('Hyprland reported configuration errors. Inspect hyprctl configerrors.')
subprocess.run(['systemctl', '--user', 'start', 'openclaw-voice.service'], check=True)
print('Installed. Microphone off. Super+Shift+V now controls the native OMA interface.')
print('Backups:', backup)
