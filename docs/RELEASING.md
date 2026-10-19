# Release process

Version `0.4.0` was the first GitHub preview release. Version `0.4.1` repairs
startup state recovery. Version `0.5.0` consolidates opt-in wake activation,
interruption controls, verified readiness, action observations and destination
presets. Tags preserve the tested source from `main`; they are
not a stable compatibility guarantee. The public repository is listed in the
marketplace with manual companion setup. New source snapshots need their own
marketplace verification.

The permanent plugin ID is `community.openclaw-voice`. The root bar package
owns its conversation/status children. The companion requires explicit setup.
Package, manifest and client versions are `0.6.1`. Later releases must update
them together and use a new tag. Do not move a published release tag.

Versions 0.5.0, 0.6.0 and 0.6.1 are owner-authorized full releases. Release
notes must still state exact-archive automated results and the missing live/desktop
qualification; older human trials do not certify a newer tag. The unresolved
request-completion contract and automatic return-to-standby remain explicit.

Version 0.6.0 adds the expandable received-answer reader, explicit audio-device
selection with a local output-only test tone, and touch/keyboard hold-to-talk.
Release can mute transmission while replies continue (default), or end the whole
voice session. Capture remains open in the default input-muted state. Publish
it as a full release, then perform the separately owner-authorized backed-up
Omarchy upgrade. Record actual upgrade results without inferring a human
conversation or a fresh graphical/plugin-manager lifecycle from automated checks.

Version 0.6.1 consolidates the lifecycle/privacy audit and explicit test-tone
callback cleanup. Its archive receives fresh automated qualification; the
historical tone abort's exact cause is not claimed as established by the cleanup
fix. Publish the full release before the authorized backed-up Surface upgrade.

## Before publication

1. Consolidate the tested implementation in the private repository.
2. Run the offline checks from [CONTRIBUTING.md](../CONTRIBUTING.md) on Linux.
3. Check installation, upgrade, removal and backup restoration in isolated user directories.
4. Check the QML components with synthetic state on Omarchy.
5. Confirm live start, stop, approval and cancellation on the intended release.
6. Update [compatibility](COMPATIBILITY.md) with the exact supported OpenClaw release and limits.
7. Review tracked files and history for private data with the publication checker.
8. Preserve [credits](../CREDITS.md) and all distributed licence notices.
9. Update package and plugin versions together before creating a release tag.
10. Obtain the owner's decision before making the repository public.

Automated tests must not open physical audio devices or contact a live provider.
Keep screenshots, recordings, transcripts and private configuration out of the repository.
An isolated installer test with mocked service commands does not prove real service-manager installation or removal.
Record that limit until a clean Omarchy installation test covers those steps.

## Remaining real Omarchy procedure

An owner-authorized upgrade of an existing desktop to the exact v0.4.0 release
has now passed its QML/native-audio checks and a manual voice/bubble trial. See
[the recorded scope](COMPATIBILITY.md#v040-upgrade-tested-on-14-october-2026).
That trial does not replace the complete disposable-desktop procedure below.

Fresh companion installation, real user-systemd start/stop, upgrade, removal,
newest-first restoration and later-edit refusal have also passed for the exact
v0.4.0 archive in a disposable Linux VM. See
[isolated installation and recovery](COMPATIBILITY.md#v040-isolated-installation-and-recovery-tested-on-14-october-2026).
The Gateway SDK was synthetic; the installer, GStreamer check and systemd calls
were real. This closes the companion install/removal/recovery gap without
claiming a fresh Omarchy OS or full graphical plugin-manager lifecycle.

Use a disposable Omarchy graphical session with Lua Hyprland, Quickshell,
user systemd and GStreamer. Do not use the live Surface/VPS or edit packaged
Omarchy. Record exact environment and plugin commit identities. Keep physical
audio unavailable during these synthetic checks.

- Add/enable the root package without a companion. Verify one plugin, working
  bar icon, no duplicate surfaces, and no installer/service/audio start.
- Preview/apply companion setup without a shortcut, then explicitly replace a
  fixture binding. Verify backups, modes, unrelated settings, no login
  enablement and no service start.
- Run `python3 test/qml_instances.py` with synthetic state/fake controls. Check
  the real bar and owned status/bubbles on each monitor, long captions, stale
  state and optional orb. Run qmllint with installed Omarchy/Quickshell imports.
- Disable/re-enable the plugin and restart the shell. Visual children must
  follow their bar owner; no service/capture may start. The companion remains
  separate: stop voice before hiding UI.
- Exercise real user-systemd start/stop/failure with a synthetic local SDK and
  generated audio/fake sinks. Confirm cgroup worker cleanup. Mocked systemctl
  calls do not establish this result.
- Migrate a disposable v0.3.4 install using [the procedure](REMOVAL.md), retaining
  selectors, placement, settings and backups. Remove old plugins only after
  checking the new root. Repeat a current-root companion upgrade.
- Stop voice, remove companion then plugin. Check no dangling UI or worker.
  Undo removal via its manifest and earlier upgrades newest-first. Make a later
  owned-file edit and confirm recovery refuses to overwrite it.

Keep desktop proof distinct from an opted-in human conversation. The later
14 October trial used the exact consolidated v0.4.0 release after a backed-up
upgrade; it does not establish clean installation, the full lifecycle matrix
or a released OpenClaw minimum.
Preserve [compatibility](COMPATIBILITY.md)
and [scope audit](PERMISSIONS.md) limits. Review the marketplace submission,
confirm its final commit/version/evidence fields and obtain owner decisions before
publication. Freeze the candidate during marketplace review; later commits do
not inherit exact-snapshot verification.

Sources checked at Omarchy `d201fb9564777fe5a8c587b4ef93a48106720f2e` and
marketplace `6787464a38421722286b6a2cfbbfc5f9c6cc65b1`:
[shell contract](https://github.com/omacom/omarchy/blob/d201fb9564777fe5a8c587b4ef93a48106720f2e/docs/omarchy-shell.md),
[submission requirements](https://github.com/omacom/omarchy-plugin-marketplace/blob/6787464a38421722286b6a2cfbbfc5f9c6cc65b1/SUBMISSION.md),
and [Octopus precedent](https://github.com/omacom/omarchy-plugin-marketplace/issues/7399).
