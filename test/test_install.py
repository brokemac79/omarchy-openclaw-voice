import json
import os
from pathlib import Path
import tempfile
import unittest
from tools.install_files import FilePlan


class InstallTests(unittest.TestCase):
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
