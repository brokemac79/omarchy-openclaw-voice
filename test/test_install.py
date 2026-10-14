import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tools.install_files import FilePlan, atomic_write, restore_plan


class InstallTests(unittest.TestCase):
    def interrupted_apply(self, root, second_exists):
        first, second = root / 'first.txt', root / 'second.txt'
        first.write_bytes(b'original first'); first.chmod(0o640)
        if second_exists:
            second.write_bytes(b'original second'); second.chmod(0o640)
        plan = FilePlan(root / 'backups/install')
        plan.put(first, b'changed first', 0o600)
        plan.put(second, b'changed second', 0o600)

        def fail_second(path, content, mode=0o600):
            if path == second:
                raise OSError('Synthetic failure before second destination write')
            atomic_write(path, content, mode)

        with patch('tools.install_files.atomic_write', side_effect=fail_second):
            with self.assertRaises(OSError):
                plan.apply()
        self.assertEqual(first.read_bytes(), b'changed first')
        self.assertEqual(second.exists(), second_exists)
        return first, second, plan.backup / 'manifest.json'

    @unittest.skipIf(os.name == 'nt', 'Unix file modes in interrupted installation')
    def test_interrupted_apply_restores_applied_files_and_skips_original_state(self):
        for second_exists in (False, True):
            with self.subTest(second_exists=second_exists), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                first, second, manifest = self.interrupted_apply(root, second_exists)
                restore = restore_plan(manifest, root / 'backups/restore')
                self.assertEqual(set(restore.files), {first})
                restore.apply()
                self.assertEqual(first.read_bytes(), b'original first')
                self.assertEqual(first.stat().st_mode & 0o777, 0o640)
                self.assertEqual(second.exists(), second_exists)
                if second_exists:
                    self.assertEqual(second.read_bytes(), b'original second')
                    self.assertEqual(second.stat().st_mode & 0o777, 0o640)

    @unittest.skipIf(os.name == 'nt', 'Unix symlinks/modes in interrupted installation')
    def test_interrupted_recovery_still_rejects_edits_symlinks_and_changed_backups(self):
        for change in ('content', 'mode', 'symlink', 'backup', 'new-file'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                first, second, manifest = self.interrupted_apply(root, change != 'new-file')
                if change in ('content', 'new-file'):
                    second.write_bytes(b'later edit')
                elif change == 'mode':
                    second.chmod(0o600)
                elif change == 'symlink':
                    target = root / 'elsewhere'; target.write_bytes(b'original second')
                    target.chmod(0o640)
                    second.unlink(); second.symlink_to(target)
                else:
                    saved = Path(json.loads(manifest.read_text())[1]['backup'])
                    saved.write_bytes(b'modified backup')
                with self.assertRaises(ValueError):
                    restore_plan(manifest, root / 'backups/restore')
                self.assertEqual(first.read_bytes(), b'changed first')
                self.assertFalse((root / 'backups/restore').exists())

    def test_external_xdg_has_recoverable_backups(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            destination = root / 'external-xdg/plugin.qml'
            destination.parent.mkdir()
            destination.write_text('old')
            plan = FilePlan(root / 'backups/run')
            plan.put(destination, 'new')
            plan.apply()
            manifest = json.loads((root / 'backups/run/manifest.json').read_text())
            self.assertEqual(Path(manifest[0]['backup']).read_text(), 'old')
            self.assertEqual(destination.read_text(), 'new')

    def test_all_paths_checked_before_any_write(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            safe = root / 'safe'; safe.write_text('old')
            invalid = root / 'directory'; invalid.mkdir()
            plan = FilePlan(root / 'backups/run')
            plan.put(safe, 'new'); plan.put(invalid, 'invalid')
            with self.assertRaises(ValueError):
                plan.apply()
            self.assertEqual(safe.read_text(), 'old')
            self.assertFalse((root / 'backups').exists())

    @unittest.skipIf(os.name == 'nt', 'Unix symlink installation guard')
    def test_symlink_file_and_ancestor_are_rejected_without_touching_target(self):
        for ancestor in (False, True):
            with tempfile.TemporaryDirectory() as root:
                root = Path(root)
                packaged = root / 'packaged'; packaged.mkdir()
                original = packaged / 'file'; original.write_text('upstream')
                link = root / 'link'
                link.symlink_to(packaged if ancestor else original)
                plan = FilePlan(root / 'backups/run')
                plan.put(link / 'file' if ancestor else link, 'replacement')
                with self.assertRaises(ValueError):
                    plan.apply()
                self.assertEqual(original.read_text(), 'upstream')
                self.assertTrue(link.is_symlink())


if __name__ == '__main__':
    unittest.main()
