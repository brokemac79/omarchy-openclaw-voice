# Disable, remove or restore the voice integration

These steps target the default installation. For a named instance, use its
dedicated control wrapper and service. See [separate instances](INSTANCES.md).

## Disable voice

1. End the call with `openclaw-voice stop`.
2. Run `systemctl --user stop openclaw-voice.service`.
3. Run `omarchy plugin disable openclaw-voice.indicator`.
4. Run `omarchy plugin disable openclaw-voice.orb`.
5. Remove only `require("hypr.openclaw-voice")` from your Hyprland configuration.
6. Run `hyprctl reload`.

Installation does not enable the service at login. If you enabled it yourself,
disable that startup before removing its unit. Keep other services unchanged.

## Remove installed files

First complete the disable steps. Review the matching installation manifest
under `$XDG_STATE_HOME/openclaw-voice/backups/`. The default state directory is
`~/.local/state`. There is no automatic uninstaller in this version.

The installer owns these files or directories:

| Location | Installed content |
| --- | --- |
| `$XDG_DATA_HOME/openclaw-voice/` | Service source, native audio worker and licence files |
| `$XDG_DATA_HOME/applications/openclaw-voice.desktop` | App launcher |
| `~/.local/bin/openclaw-voice` | Control launcher |
| `$XDG_CONFIG_HOME/systemd/user/openclaw-voice.service` | Default service unit |
| `$XDG_CONFIG_HOME/hypr/openclaw-voice.lua` | Voice shortcut |
| `$XDG_CONFIG_HOME/omarchy/plugins/openclaw-voice.indicator/` | Bar plugin |
| `$XDG_CONFIG_HOME/omarchy/plugins/openclaw-voice.orb/` | Conversation plugin |
| `$XDG_CONFIG_HOME/omarchy/plugins/openclaw-voice-shared/Instance.js` | Shared instance selector |

Default data and configuration directories are `~/.local/share` and `~/.config`.
Remove only files that belong to the installation being removed.
Keep shared source or plugin files if another named instance still uses them.
Do not remove your OpenClaw installation, credentials or unrelated settings.

Run `systemctl --user daemon-reload` after removing the unit.
Remove only this widget's entry from the current Omarchy bar configuration if it remains.
Keep the backup directory until you finish checking removal.

## Restore overwritten files

Each backup manifest records `path`, `backup`, original `mode` and the installation operation.
Review each destination for changes made after installation.
Restore the saved file and mode only when that destination still belongs to this installation.
A write entry with no backup identifies a file created by the installer.
A remove entry with no backup identifies an already absent file and needs no restoration.

Restore installations in reverse order when reverting multiple upgrades.
Do not replace the complete current shell or Hyprland configuration with an old snapshot.
Restore only the relevant settings if you made later changes.
The shortcut configuration replaces `Super+Shift+V`, so restore your previous binding separately if necessary.
