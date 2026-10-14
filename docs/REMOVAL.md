# Disable, remove, migrate or restore

The plugin (`community.openclaw-voice`) and companion have separate lifecycles.
Disabling/removing the plugin hides its bar icon, status and speech bubbles;
it **does not stop an active call or uninstall the companion**. Stop voice first.
Re-enabling the plugin only watches state and does not start a service or capture.
Named instances use their own wrapper and unit; see [INSTANCES.md](INSTANCES.md).

## Disable and re-enable

For the default instance:

```sh
openclaw-voice stop
systemctl --user stop openclaw-voice.service
omarchy plugin disable community.openclaw-voice
# Later, restore the UI:
omarchy plugin enable community.openclaw-voice
```

The app launcher and any opted-in shortcut can still start voice while the UI
is disabled. To disable these entry points too, remove the companion as below.
Installation never enables login startup. If you enabled the unit yourself,
disable that startup before removal. Do not change unrelated/named units.

## Remove the companion, then the plugin

From the reviewed plugin checkout, preview the companion removal:

```sh
python3 install.py --remove
python3 install.py --remove --apply
# Only after companion removal succeeds:
omarchy plugin remove community.openclaw-voice
```

Removal stops the default service, restores files displaced by the first
receipted install, removes newly created companion files and reloads systemd.
It leaves the service stopped. It does not remove OpenClaw, voice options,
credentials, named-instance units, backups or unrelated files. Keep shared
service source if another named instance still uses it; do not run default
removal until those instances have their own source or have been retired.

The ownership receipt is `$XDG_STATE_HOME/openclaw-voice/installation.json`.
The default state root is `~/.local/state`. A changed or deleted owned file
blocks removal before the service is stopped or any files are changed. Review
that conflict and retain your edits; do not force a whole-directory deletion.

An installer-added Hyprland include is removed as one exact line, preserving
later unrelated settings. If the include itself was edited, resolve it manually.
Reload Hyprland with `hyprctl reload` after removal when using the shortcut.
If the include predated the receipted installation it is preserved, along with
the displaced shortcut file. Do not restore an old whole desktop configuration.
Empty directories may remain; they are harmless and are not recursively removed.

## Undo an install, upgrade or removal

Each backup directory records original bytes/modes and expected installed
hashes/modes in `manifest.json`. Keep the receipt and all backup directories
until removal/rollback is verified. Use manifests newest first:

```sh
python3 install.py --restore /path/to/backups/TIMESTAMP/manifest.json
python3 install.py --restore /path/to/backups/TIMESTAMP/manifest.json --apply
```

The whole restore is checked before mutation. Later file edits, changed modes,
modified backup bytes or symlink paths cause refusal. A successful restore
creates its own recovery manifest and leaves the companion stopped. Restart it
explicitly only after reviewing the restored version/configuration. This file
recovery does not restore service startup state or run a Hyprland reload.

Older v0.3.4 manifests lack the expected installed hashes and cannot be restored
by this command. Inspect them manually: restore each saved file and its mode
only if you have established ownership and preserved later changes. A manifest
entry without an original backup was created by that install. Never replace
current shell.json or hyprland.lua wholesale with an old snapshot.

## Migrate a v0.3.4 two-plugin installation

This is a deliberate package-ID transition, not an automatic live migration.
Keep a backup of the old plugin folders and record the indicator's placement,
`voiceInstance`, `voiceControl`, and the orb's optional `showOrb` before changing
anything. Custom per-instance harnesses should migrate their QML paths too.

1. Stop voice through the selected instance's wrapper; stop its service.
2. Disable `openclaw-voice.indicator` and `openclaw-voice.orb` through
   `omarchy plugin disable`. Keep their folders for rollback until checked.
3. Add the reviewed new repository root as `community.openclaw-voice`, then
   enable it. Configure its bar placement and per-widget settings to match the
   recorded selector/control and orb option before starting voice. The owned
   conversation uses the same selector, so no separate panel setting is needed.
4. Preview companion setup with `python3 install.py --replace-existing` and
   apply that same plan explicitly. Existing service files are backed up.
   Shortcut replacement still requires `--replace-shortcut`; otherwise existing
   Hyprland files remain unchanged. Preserve old installation backups.
5. Explicitly start the selected companion, check status/preflight with capture
   off, then perform the separate opted-in voice check when ready.
6. After validation, remove the two disabled legacy plugin folders through
   `omarchy plugin remove`. Keep a reviewed backup. Remove the old shared
   `openclaw-voice-shared/Instance.js` only if no custom/named harness uses it.

No legacy folder/configuration is silently deleted by the new installer. This
migration procedure needs the real isolated Omarchy check in
[release preparation](RELEASING.md); fixture tests do not prove it on a desktop.
