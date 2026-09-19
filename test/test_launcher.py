import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import unittest

LAUNCHER = Path(__file__).resolve().parents[1] / 'bin/openclaw-voice'


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
