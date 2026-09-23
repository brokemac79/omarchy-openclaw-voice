"""Run the real installer against temporary files and fake desktop commands."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipIf(os.name == 'nt', 'Installer targets the Linux desktop')
class InstallerSmokeTests(unittest.TestCase):
    def test_install_upgrade_and_manifest_restore(self):
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory(prefix='voice-install-') as directory:
            root = Path(directory)
            home = root / 'home'
            config, data, state = (root / name for name in ('config', 'data', 'state'))
            hypr = config / 'hypr/hyprland.lua'
            shell = config / 'omarchy/shell.json'
            obsolete = data / 'openclaw-voice/src/browser.mjs'
            originals = {
                hypr: b'-- unrelated user settings\n',
                shell: b'{"unrelated": true}\n',
                obsolete: b'// previous app-owned browser implementation\n',
            }
            for path, content in originals.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
                path.chmod(0o640)
            calls = []
            installed = False

            def check_output(argv, **_kwargs):
                calls.append(argv)
                if argv == [str(Path(sys.executable).resolve()), '-p',
                            'process.versions.node.split(".")[0]']:
                    return '24\n'
                if argv == ['systemctl', '--user', 'show', 'openclaw-voice.service',
                            '--property=LoadState', '--value']:
                    return 'loaded\n' if installed else 'not-found\n'
                if argv == ['hyprctl', 'configerrors']:
                    return 'ok\n'
                raise AssertionError('Unexpected command: ' + repr(argv))

            def run(argv, **kwargs):
                calls.append(argv)
                self.assertTrue(kwargs.get('check'))
                allowed = [
                    ['/usr/bin/python3', str(source / 'native/audio.py'), '--check'],
                    ['systemctl', '--user', 'stop', 'openclaw-voice.service'],
                    ['systemctl', '--user', 'daemon-reload'],
                    ['systemctl', '--user', 'start', 'openclaw-voice.service'],
                    ['hyprctl', 'reload'],
                    ['omarchy', 'bar', 'move', 'openclaw-voice.indicator', '--section', 'right'],
                ]
                for name in ('openclaw-voice.orb', 'openclaw-voice.indicator'):
                    allowed.extend([
                        ['omarchy', 'plugin', 'validate', str(config / 'omarchy/plugins' / name)],
                        ['omarchy', 'plugin', 'enable', name],
                    ])
                self.assertIn(argv, allowed)
                if argv[:3] == ['omarchy', 'plugin', 'enable']:
                    settings = json.loads(shell.read_text())
                    settings.setdefault('fixtureEnabled', []).append(argv[3])
                    shell.write_text(json.dumps(settings))
                return subprocess.CompletedProcess(argv, 0)

            environment = {'HOME': str(home), 'XDG_CONFIG_HOME': str(config),
                           'XDG_DATA_HOME': str(data), 'XDG_STATE_HOME': str(state)}
            with patch.dict(os.environ, environment), patch.object(Path, 'home', return_value=home), \
                    patch('shutil.which', return_value=sys.executable), \
                    patch('subprocess.check_output', side_effect=check_output), \
                    patch('subprocess.run', side_effect=run), \
                    patch.object(sys, 'argv', ['install.py', '--node', sys.executable]), \
                    contextlib.redirect_stdout(io.StringIO()):
                for _ in range(2):
                    runpy.run_path(str(source / 'install.py'), run_name='__main__')
                    installed = True

            self.assertEqual(hypr.read_text().count('require("hypr.openclaw-voice")'), 1)
            self.assertFalse(obsolete.exists())
            self.assertTrue(json.loads(shell.read_text())['unrelated'])
            launcher = home / '.local/bin/openclaw-voice'
            self.assertEqual(stat.S_IMODE(launcher.stat().st_mode), 0o755)
            for name in ('openclaw-voice.orb', 'openclaw-voice.indicator'):
                plugin = config / 'omarchy/plugins' / name
                manifest = json.loads((plugin / 'manifest.json').read_text())
                for entrypoint in manifest['entryPoints'].values():
                    self.assertTrue((plugin / entrypoint).is_file())
            self.assertTrue((config / 'omarchy/plugins/openclaw-voice-shared/Instance.js').is_file())
            self.assertEqual(calls.count(['systemctl', '--user', 'stop', 'openclaw-voice.service']), 1)

            manifests = sorted((state / 'openclaw-voice/backups').glob('*/manifest.json'))
            self.assertEqual(len(manifests), 2)
            for manifest in reversed(manifests):
                for entry in reversed(json.loads(manifest.read_text())):
                    destination = Path(entry['path'])
                    self.assertTrue(destination.is_relative_to(root))
                    if entry['backup'] is None:
                        destination.unlink(missing_ok=True)
                    else:
                        destination.write_bytes(Path(entry['backup']).read_bytes())
                        destination.chmod(entry['mode'])
            for path, content in originals.items():
                self.assertEqual(path.read_bytes(), content)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            remaining = {path for base in (home, config, data) for path in base.rglob('*') if path.is_file()}
            self.assertEqual(remaining, set(originals))


if __name__ == '__main__':
    unittest.main()
