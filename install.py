#!/usr/bin/env python3
"""Explicit companion setup; marketplace plugin enable never runs this script."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
from tools.install_files import FilePlan, fingerprint, restore_plan, validate_path

REQUIRE = 'require("hypr.openclaw-voice")\n'


def quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%') + '"'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default=shutil.which('node'))
    parser.add_argument('--apply', action='store_true', help='apply the printed plan; default is preview only')
    parser.add_argument('--replace-shortcut', action='store_true',
                        help='explicitly replace Super+Shift+V with the voice toggle')
    parser.add_argument('--replace-existing', action='store_true',
                        help='back up and replace existing companion files, including local edits')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--remove', action='store_true', help='restore displaced files and remove this companion')
    action.add_argument('--restore', type=Path, help='restore one new-format backup manifest, newest first')
    args = parser.parse_args()
    if os.name != 'posix':
        parser.error('Companion installation targets a Linux user session.')
    if not shutil.which('systemctl'):
        parser.error('systemctl is required; no packages are installed by this script.')
    home = Path.home()
    config = Path(os.environ.get('XDG_CONFIG_HOME', home / '.config'))
    data = Path(os.environ.get('XDG_DATA_HOME', home / '.local/share'))
    state = Path(os.environ.get('XDG_STATE_HOME', home / '.local/state'))
    target = data / 'openclaw-voice'
    state_dir = state / 'openclaw-voice'
    receipt = state_dir / 'installation.json'
    validate_path(receipt)
    backup = state_dir / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    previous = json.loads(receipt.read_text()) if receipt.exists() else {'files': [], 'shortcutRequireAdded': False}
    plan = FilePlan(backup)
    old_files = {entry['path']: entry for entry in previous['files']}

    if args.restore:
        plan = restore_plan(args.restore, backup)
    elif args.remove:
        if not receipt.exists():
            parser.error('No installation receipt. Follow docs/REMOVAL.md for legacy installations.')
        for entry in previous['files']:
            path = Path(entry['path'])
            validate_path(path)
            current = path.read_bytes() if path.exists() else None
            if fingerprint(current) != entry['sha256'] or (path.exists() and path.stat().st_mode & 0o777 != entry['mode']):
                parser.error('Removal conflict; preserve later edits: ' + str(path))
            if entry['original']:
                saved = Path(entry['original'])
                validate_path(saved)
                content = saved.read_bytes()
                if fingerprint(content) != entry['originalSha256']:
                    parser.error('Original backup changed: ' + str(saved))
                plan.put(path, content, entry['originalMode'])
            else:
                plan.remove(path)
        if previous['shortcutRequireAdded']:
            hypr = config / 'hypr/hyprland.lua'
            validate_path(hypr)
            text = hypr.read_text()
            if text.splitlines(keepends=True).count(REQUIRE) > 1:
                parser.error('Shortcut include is ambiguous; review it before removal.')
            lines = text.splitlines(keepends=True)
            if REQUIRE not in lines and 'hypr.openclaw-voice' in text:
                parser.error('Shortcut include was edited; review it before removal.')
            plan.put(hypr, ''.join(line for line in lines if line != REQUIRE), hypr.stat().st_mode & 0o777)
        plan.remove(receipt)
    else:
        if not args.node or not Path(args.node).is_file():
            parser.error('Node.js is required; pass --node /path/to/node.')
        node = str(Path(args.node).resolve())
        major = int(subprocess.check_output([node, '-p', 'process.versions.node.split(".")[0]'], text=True))
        if major < 22:
            parser.error('Node.js 22 or newer is required.')
        source = Path(__file__).resolve().parent
        for directory in ('src', 'native'):
            for file in (source / directory).glob('*'):
                if file.is_file():
                    plan.put(target / directory / file.name, file.read_bytes())
        for name in ('LICENSE', 'LICENSE-OMA', 'LICENSE-OPENCLAW', 'CREDITS.md', 'package.json'):
            plan.put(target / name, (source / name).read_bytes())
        plan.put(home / '.local/bin/openclaw-voice', (source / 'bin/openclaw-voice').read_bytes(), 0o755)
        plan.put(config / 'systemd/user/openclaw-voice.service', f'''[Unit]
Description=OpenClaw Voice companion
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

# Started explicitly/on demand; installation never starts or enables this service.
''')
        plan.put(data / 'applications/openclaw-voice.desktop', f'''[Desktop Entry]
Type=Application
Name=OpenClaw Voice
Comment=Start or end your OpenClaw voice conversation
Exec="{home}/.local/bin/openclaw-voice" toggle
Icon=audio-input-microphone
Terminal=false
Categories=AudioVideo;Audio;
''')
        require_added = previous['shortcutRequireAdded']
        hypr = config / 'hypr/hyprland.lua'
        shortcut = config / 'hypr/openclaw-voice.lua'
        if args.replace_shortcut:
            validate_path(hypr)
            text = hypr.read_text()
            plan.put(shortcut, f'''-- Explicitly opted-in OpenClaw Voice shortcut.
hl.unbind("SUPER + SHIFT + V")
o.bind("SUPER + SHIFT + V", "Talk to OpenClaw / end voice", {json.dumps(str(home / '.local/bin/openclaw-voice'))} .. " toggle")
''')
            if REQUIRE.strip() not in text:
                plan.put(hypr, text + ('' if text.endswith('\n') else '\n') + REQUIRE, hypr.stat().st_mode & 0o777)
                require_added = True
        # Preserve a previous opted-in shortcut and all of its later edits unless
        # replacement was explicitly requested. It remains tracked for removal.
        entries = dict(old_files)
        for index, (path, (content, mode)) in enumerate(plan.files.items()):
            validate_path(path)
            if path == hypr:
                continue  # Shared config: only the added include is ours.
            old = old_files.get(str(path))
            if path.exists():
                unchanged = old and fingerprint(path.read_bytes()) == old['sha256'] and path.stat().st_mode & 0o777 == old['mode']
                if not unchanged and not args.replace_existing:
                    parser.error('Existing/local-edited companion file; preview --replace-existing first: ' + str(path))
            elif old and not args.replace_existing:
                parser.error('Installed companion file was removed; review --replace-existing: ' + str(path))
            original = old['original'] if old else (str(backup / f'{index:04d}.bak') if path.exists() else None)
            entries[str(path)] = {'path': str(path), 'sha256': fingerprint(content), 'mode': mode,
                'original': original, 'originalMode': old['originalMode'] if old else (path.stat().st_mode & 0o777 if path.exists() else None),
                'originalSha256': old['originalSha256'] if old else (fingerprint(path.read_bytes()) if path.exists() else None)}
        plan.put(receipt, json.dumps({'files': list(entries.values()), 'shortcutRequireAdded': require_added}, indent=2) + '\n')

    plan.validate()
    print('Companion file plan (no plugin, credentials, packages or login startup changes):')
    for path, (content, _) in plan.files.items():
        print(('  remove ' if content is None else '  write  ') + str(path))
    print('Stop existing default companion, then reload user systemd units. Leave service stopped.')
    print('Backup:', backup)
    if args.replace_shortcut:
        print('OPT-IN: replace Super+Shift+V; reload Hyprland manually after reviewing the file.')
    if not args.apply:
        print('Preview only. Repeat with --apply after reviewing this plan.')
        return
    if not args.remove and not args.restore:
        # Imports/checks GStreamer only; --check never opens audio devices.
        subprocess.run(['/usr/bin/python3', str(source / 'native/audio.py'), '--check'], check=True)
    load_state = subprocess.check_output(['systemctl', '--user', 'show', 'openclaw-voice.service',
                                          '--property=LoadState', '--value'], text=True).strip()
    if load_state != 'not-found':
        subprocess.run(['systemctl', '--user', 'stop', 'openclaw-voice.service'], check=True)
    plan.apply()
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    print('Applied. Companion remains stopped. Review docs/REMOVAL.md before restoring or removing files.')
    print('Recovery manifest:', backup / 'manifest.json')


if __name__ == '__main__':
    main()
