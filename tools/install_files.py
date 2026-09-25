"""Atomic user-file installation with a complete, location-independent backup map."""
import json
import hashlib
import os
from pathlib import Path
import tempfile


def validate_path(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Installation paths must be absolute and normalized.')
    if path == Path('/usr/share/omarchy') or Path('/usr/share/omarchy') in path.parents:
        raise ValueError('Packaged Omarchy files cannot be changed.')
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ValueError('Installation refuses symlinks: ' + str(part))
        if part.exists() and part != path and not part.is_dir():
            raise ValueError('Installation parent is not a directory.')
    if path.exists() and not path.is_file():
        raise ValueError('Installation destination is not a regular file.')


def atomic_write(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.openclaw-voice-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(content)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fingerprint(content):
    return hashlib.sha256(content).hexdigest() if content is not None else None


def restore_plan(manifest, backup):
    """Preflight the whole recovery; refuse to overwrite edits since installation."""
    plan = FilePlan(backup)
    for record in reversed(json.loads(Path(manifest).read_text())):
        path = Path(record['path'])
        validate_path(path)
        current = path.read_bytes() if path.exists() else None
        if 'installedSha256' not in record or fingerprint(current) != record['installedSha256']:
            raise ValueError('Restore conflict; preserve later edits: ' + str(path))
        if current is not None and path.stat().st_mode & 0o777 != record['installedMode']:
            raise ValueError('Restore conflict; file mode changed: ' + str(path))
        if record['backup']:
            saved = Path(record['backup'])
            validate_path(saved)
            content = saved.read_bytes()
            if fingerprint(content) != record['originalSha256']:
                raise ValueError('Backup content changed: ' + str(saved))
            plan.put(path, content, record['mode'])
        else:
            plan.remove(path)
    plan.validate()
    return plan


class FilePlan:
    def __init__(self, backup):
        self.backup = Path(backup)
        self.files = {}

    def put(self, path, content, mode=0o600):
        self.files[Path(path)] = (content.encode() if isinstance(content, str) else content, mode)

    def remove(self, path):
        self.files[Path(path)] = (None, None)

    def validate(self):
        validate_path(self.backup / 'manifest.json')
        for path in self.files:
            validate_path(path)

    def apply(self):
        self.validate()
        self.backup.mkdir(parents=True, mode=0o700, exist_ok=False)
        records = []
        for index, (path, (content, mode)) in enumerate(self.files.items()):
            validate_path(path)
            old = None
            old_mode = None
            if path.exists():
                old = self.backup / f'{index:04d}.bak'
                old_mode = path.stat().st_mode & 0o777
                atomic_write(old, path.read_bytes())
            records.append({'path': str(path), 'backup': str(old) if old else None,
                            'mode': old_mode, 'operation': 'remove' if content is None else 'write',
                            'originalSha256': fingerprint(old.read_bytes()) if old else None,
                            'installedSha256': fingerprint(content), 'installedMode': mode})
            # Record recovery data before changing each destination.
            atomic_write(self.backup / 'manifest.json', json.dumps(records, indent=2).encode())
            if content is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, content, mode)
