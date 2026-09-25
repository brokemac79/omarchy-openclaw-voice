# Prepare a public release

The repository remains private during development. This checklist does not
authorize publication, a release tag or a marketplace submission.

The proposed permanent ID is `community.openclaw-voice`. The root bar package
owns its conversation/status children. The companion requires explicit setup.
Package/manifest/client versions remain 0.3.4 during preparation; this is not a
new release and must not replace the existing tag. Choose a version at release.

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

Keep desktop proof distinct from an opted-in human conversation. Staged main
has no spoken outcome and is not a released minimum. Preserve [compatibility](COMPATIBILITY.md)
and [scope audit](PERMISSIONS.md) limits. Review [the submission draft](SUBMISSION-DRAFT.md),
fill final commit/version/evidence fields and obtain owner decisions before
publication. Freeze the candidate during marketplace review; later commits do
not inherit exact-snapshot verification.

Sources checked at Omarchy `d201fb9564777fe5a8c587b4ef93a48106720f2e` and
marketplace `6787464a38421722286b6a2cfbbfc5f9c6cc65b1`:
[shell contract](https://github.com/omacom/omarchy/blob/d201fb9564777fe5a8c587b4ef93a48106720f2e/docs/omarchy-shell.md),
[submission requirements](https://github.com/omacom/omarchy-plugin-marketplace/blob/6787464a38421722286b6a2cfbbfc5f9c6cc65b1/SUBMISSION.md),
and [Octopus precedent](https://github.com/omacom/omarchy-plugin-marketplace/issues/7399).
