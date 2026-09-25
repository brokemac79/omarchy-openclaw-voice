"""Real file-plan tests in a disposable home; systemd/audio probes are mocked.

These are installer regression tests, not real Omarchy desktop lifecycle proof.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipIf(os.name == 'nt', 'Installer targets the Linux desktop')
class InstallerSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='voice-install-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / 'home'
        self.config, self.data, self.state = (self.root / name for name in ('config', 'data', 'state'))
        self.hypr = self.config / 'hypr/hyprland.lua'
        self.shell = self.config / 'omarchy/shell.json'
        for path, content in [(self.hypr, '-- unrelated settings\n'), (self.shell, '{"unrelated":true}\n')]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.source = Path(__file__).resolve().parents[1]
        self.calls = []
        self.loaded = False
        self.fail_stop = False
        self.receipt = self.state / 'openclaw-voice/installation.json'

    def run_installer(self, *args):
        def check_output(argv, **_kwargs):
            self.calls.append(argv)
            if argv == [str(Path(sys.executable).resolve()), '-p', 'process.versions.node.split(".")[0]']:
                return '24\n'
            if argv == ['systemctl', '--user', 'show', 'openclaw-voice.service', '--property=LoadState', '--value']:
                return 'loaded\n' if self.loaded else 'not-found\n'
            raise AssertionError('Unexpected command: ' + repr(argv))

        def run(argv, **kwargs):
            self.calls.append(argv)
            self.assertTrue(kwargs.get('check'))
            self.assertIn(argv, [
                ['/usr/bin/python3', str(self.source / 'native/audio.py'), '--check'],
                ['systemctl', '--user', 'stop', 'openclaw-voice.service'],
                ['systemctl', '--user', 'daemon-reload'],
            ])
            if self.fail_stop and 'stop' in argv:
                raise subprocess.CalledProcessError(1, argv)
            return subprocess.CompletedProcess(argv, 0)

        environment = {'HOME': str(self.home), 'XDG_CONFIG_HOME': str(self.config),
                       'XDG_DATA_HOME': str(self.data), 'XDG_STATE_HOME': str(self.state)}
        with patch.dict(os.environ, environment), patch.object(Path, 'home', return_value=self.home), \
                patch('shutil.which', return_value=sys.executable), \
                patch('subprocess.check_output', side_effect=check_output), \
                patch('subprocess.run', side_effect=run), \
                patch.object(sys, 'argv', ['install.py', '--node', sys.executable, *args]), \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            runpy.run_path(str(self.source / 'install.py'), run_name='__main__')

    def snapshot(self):
        return {str(p): (p.read_bytes(), p.stat().st_mode & 0o777)
                for base in (self.home, self.config, self.data) if base.exists()
                for p in base.rglob('*') if p.is_file()}

    def test_preview_install_upgrade_remove_and_restore(self):
        original = self.snapshot()
        self.run_installer()
        self.assertEqual(self.snapshot(), original)
        self.assertFalse(self.receipt.exists())
        self.assertFalse(any('systemctl' in argv for argv in self.calls))
        self.run_installer('--apply')
        self.loaded = True
        self.assertEqual(self.hypr.read_text(), '-- unrelated settings\n')
        self.assertFalse((self.config / 'omarchy/plugins').exists())
        launcher = self.home / '.local/bin/openclaw-voice'
        self.assertEqual(launcher.stat().st_mode & 0o777, 0o755)
        self.run_installer('--apply')
        installed = self.snapshot()
        self.run_installer('--remove', '--apply')
        self.assertEqual(self.snapshot(), original)
        self.assertFalse(self.receipt.exists())
        manifests = sorted((self.state / 'openclaw-voice/backups').glob('*/manifest.json'))
        # Undo removal, then undo upgrade/install; recovery plans themselves retain backups.
        self.run_installer('--restore', str(manifests[-1]), '--apply')
        self.assertEqual(self.snapshot(), installed)
        for manifest in reversed(manifests[:-1]):
            self.run_installer('--restore', str(manifest), '--apply')
        self.assertEqual(self.snapshot(), original)
        self.assertFalse(self.receipt.exists())

    def test_shortcut_opt_in_preserves_later_unrelated_config(self):
        self.run_installer('--replace-shortcut', '--apply')
        self.hypr.write_text(self.hypr.read_text() + '-- later unrelated edit\n')
        self.shell.write_text('{"later":true}\n')
        self.run_installer('--apply')
        self.assertEqual(self.hypr.read_text().count('require("hypr.openclaw-voice")'), 1)
        self.run_installer('--remove', '--apply')
        self.assertEqual(self.hypr.read_text(), '-- unrelated settings\n-- later unrelated edit\n')
        self.assertEqual(self.shell.read_text(), '{"later":true}\n')

    def test_changed_owned_file_blocks_upgrade_removal_and_restore_before_stop(self):
        self.run_installer('--apply')
        manifest = next((self.state / 'openclaw-voice/backups').glob('*/manifest.json'))
        launcher = self.home / '.local/bin/openclaw-voice'
        launcher.write_text('# later user edit\n')
        expected = self.snapshot()
        self.calls.clear()
        for args in [('--apply',), ('--remove', '--apply'), ('--restore', str(manifest), '--apply')]:
            with self.assertRaises((SystemExit, ValueError)):
                self.run_installer(*args)
            self.assertEqual(self.snapshot(), expected)
        self.assertFalse(any('stop' in argv for argv in self.calls))

    def test_displaced_file_is_restored_after_upgrade_and_removal(self):
        launcher = self.home / '.local/bin/openclaw-voice'
        launcher.parent.mkdir(parents=True)
        launcher.write_text('# previous launcher\n')
        launcher.chmod(0o750)
        with self.assertRaises(SystemExit):
            self.run_installer('--apply')
        self.run_installer('--replace-existing', '--apply')
        self.run_installer('--apply')
        self.run_installer('--remove', '--apply')
        self.assertEqual(launcher.read_text(), '# previous launcher\n')
        self.assertEqual(launcher.stat().st_mode & 0o777, 0o750)

    def test_stop_failure_leaves_all_files_untouched(self):
        self.loaded = self.fail_stop = True
        expected = self.snapshot()
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_installer('--apply')
        self.assertEqual(self.snapshot(), expected)
        self.assertFalse(self.receipt.exists())

    def test_edited_shortcut_and_include_are_preserved(self):
        self.run_installer('--replace-shortcut', '--apply')
        shortcut = self.config / 'hypr/openclaw-voice.lua'
        shortcut.write_text('-- later shortcut edit\n')
        self.run_installer('--apply')
        self.assertEqual(shortcut.read_text(), '-- later shortcut edit\n')
        with self.assertRaises(SystemExit):
            self.run_installer('--remove', '--apply')
        # Recover the file from this synthetic source by explicitly consenting,
        # then alter the include itself; removal must not silently change it.
        self.run_installer('--replace-shortcut', '--replace-existing', '--apply')
        self.hypr.write_text(self.hypr.read_text().replace('require("hypr.openclaw-voice")',
                                                        '-- require("hypr.openclaw-voice")'))
        expected = self.snapshot()
        with self.assertRaises(SystemExit):
            self.run_installer('--remove', '--apply')
        self.assertEqual(self.snapshot(), expected)


if __name__ == '__main__':
    unittest.main()
