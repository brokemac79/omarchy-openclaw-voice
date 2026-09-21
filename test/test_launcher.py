import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
import runpy
from unittest.mock import patch

LAUNCHER = Path(__file__).resolve().parents[1] / 'bin/openclaw-voice'


class InstanceLauncherTests(unittest.TestCase):
    def test_mapping_rejects_invalid_names_before_io(self):
        module = runpy.run_path(str(LAUNCHER))
        resolve = module['instance_basename']
        for name, expected in [(None, 'openclaw-voice'), ('default', 'openclaw-voice'),
                               ('test-a_1', 'openclaw-voice-test-a_1')]:
            self.assertEqual(resolve({} if name is None else {'OPENCLAW_VOICE_INSTANCE': name}), expected)
        for name in ['', '..', '../default', 'with space', 'a;true', 'A', 'x\n', 'a' * 33]:
            with self.assertRaises(ValueError):
                resolve({'OPENCLAW_VOICE_INSTANCE': name})
            with patch.dict(os.environ, {'OPENCLAW_VOICE_INSTANCE': name}), \
                    patch('socket.socket') as sock, patch('subprocess.run') as run, \
                    patch.object(sys, 'argv', [str(LAUNCHER), 'toggle']):
                with self.assertRaises(SystemExit):
                    module['main']()
                sock.assert_not_called()
                run.assert_not_called()

    def test_all_candidate_failure_paths_only_address_candidate_unit(self):
        module = runpy.run_path(str(LAUNCHER))
        for mode in ['toggle', 'stop', 'status']:
            for failure in [False, True]:
                with self.subTest(mode=mode, service_fails=failure), \
                        patch.dict(os.environ, {'OPENCLAW_VOICE_INSTANCE': 'test', 'XDG_RUNTIME_DIR': '/tmp/test'}), \
                        patch.object(sys, 'argv', [str(LAUNCHER), mode]), \
                        patch('socket.AF_UNIX', 1, create=True), \
                        patch('socket.socket', side_effect=OSError('synthetic control failure')), \
                        patch('time.sleep'), patch('subprocess.run') as run:
                    def command(args, **kwargs):
                        if failure and args[0] == 'systemctl' and kwargs.get('check'):
                            raise subprocess.CalledProcessError(1, args)
                        return subprocess.CompletedProcess(args, 0)
                    run.side_effect = command
                    with self.assertRaises(SystemExit):
                        module['main']()
                    calls = [c.args[0] for c in run.call_args_list if c.args[0][0] == 'systemctl']
                    self.assertTrue(calls)
                    self.assertTrue(all(c[-1] == 'openclaw-voice-test.service' for c in calls), calls)
                    if mode == 'toggle':
                        self.assertIn(['systemctl', '--user', 'stop', 'openclaw-voice-test.service'], calls)


@unittest.skipIf(os.name == 'nt', 'Linux launcher and Unix socket')
class LauncherTests(unittest.TestCase):
    def test_existing_manual_daemon_does_not_start_a_competing_unit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'openclaw-voice').mkdir()
            commands = []
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
                server.bind(str(root / 'openclaw-voice/control.sock'))
                server.listen()

                def reply():
                    for _ in range(2):
                        with server.accept()[0] as client:
                            commands.append(json.loads(client.recv(8192))['command'])
                            client.sendall(b'{"ok":true,"connected":true,"active":false}\n')

                worker = threading.Thread(target=reply, daemon=True)
                worker.start()
                # No systemctl or notify-send exists on this isolated PATH.
                result = subprocess.run([sys.executable, str(LAUNCHER), 'status'],
                                        env={**os.environ, 'XDG_RUNTIME_DIR': str(root), 'PATH': str(root)},
                                        capture_output=True, text=True, timeout=5)
                worker.join(timeout=2)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(commands, ['status', 'status'])

    def test_failed_control_does_not_claim_manual_microphone_is_off(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            # Fake only the external command; never touch the real user service.
            for name in ('systemctl', 'notify-send'):
                fake = root / name
                fake.write_text('#!/bin/sh\nexit 0\n')
                fake.chmod(0o700)
            result = subprocess.run([sys.executable, str(LAUNCHER), 'stop'],
                                    env={**os.environ, 'XDG_RUNTIME_DIR': str(root), 'PATH': str(root)},
                                    capture_output=True, text=True, timeout=5)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn('"ok": true', result.stdout)
