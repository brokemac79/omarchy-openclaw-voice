# Tested compatibility

This integration is under development. A released minimum OpenClaw version is
not yet established. Do not interpret the candidate's version label as a
supported range such as `>=2026.9.5`.

## v0.6.0 automated qualification

The merged answer reader, audio setup and hold-to-talk features passed 133 Node
tests and 38 Python tests on Linux without skips, with all 134 tracked source
files matching the isolated proof copy. All nine actual Omarchy renderer checks
passed, including keyboard/touch hold release, audio selection, answer clipboard,
controls, action observations, destinations, instance isolation, cold start and
wake states. Generated WebRTC, hold gating, test-tone and wake checks passed with
fake audio sinks and no physical capture or live provider.

Default hold release mutes transmission while capture remains open and replies
continue. Private `holdRelease: "end"` instead ends capture/playback. Provider
speech detection still owns turn boundaries; release is not an exact commit,
cancellation or completion signal. Global shortcut setup is explicit and off by
default. See [hold limits](HOLD-TO-TALK.md), [audio limits](AUDIO-DEVICES.md) and
[received-answer limits](ANSWERS.md).

The exact release archive identity and final qualification are recorded in its
GitHub release notes. The owner authorized a backed-up upgrade on the existing
Omarchy machine after publication; that operation is separate from the synthetic
proofs. No physical hold-latency test, live conversation, fresh enrollment,
full graphical/plugin-manager lifecycle or released OpenClaw minimum is claimed
for this tag. Existing Gateway/SDK source compatibility evidence below remains
bounded to its recorded revisions.

## v0.5.0 automated qualification

The consolidated feature source at `1bef651554b53a8420ee31de40332213d62d5db0`
passed 106 Node tests and 29 Python tests on Linux, without skips, plus actual
Omarchy renderer checks for destination labels/presets, controls, action cards,
wake/readiness state, instance isolation and all five cold-start cases. All 71
production/test source files matched the tested copy. Tests used synthetic
Gateway/media fixtures and left the normal installation unchanged.

The release commit updates package, manifest and Gateway client versions
consistently to 0.5.0. Its exact source archive identity, checksum and final
validation results are recorded in the GitHub release notes. Source contracts
were inspected at OpenClaw `d6d7435f59ec2c5aba5b7f571815a1def75a404c` and the
discovery fields were also checked at `9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa`.
These are source compatibility checks, not a new live Gateway/provider trial.

No released OpenClaw minimum or future-main range is established. Live speech,
new enrollment, a full fresh graphical plugin lifecycle and the complete
approval/denial/revocation matrix remain unqualified for this exact tag.
Previous v0.4.0 lifecycle and human evidence below, and the separately scoped
wake trial in [WAKE-WORD.md](WAKE-WORD.md), retain their original version limits.
No physical re-test of the dual wake spelling fix was requested or performed.

Known feature boundaries: exact-request cancellation and authoritative host
results remain unavailable; only final text already received can be retained.
One-request return to standby stays disabled. Destination presets provide
observed existing session context and preserve Gateway/node authority; they do
not grant permissions or guarantee the execution location of every tool.
Companion installation and external wake models remain explicit manual setup.
An older marketplace review does not certify this source snapshot.

## v0.4.1 startup recovery tested on 16 October 2026

The bar and caption panel read the companion's runtime files. On Omarchy
`4.0.4-1` with Quickshell `0.3.1-1`, the v0.4.0 watchers remained unattached
when the parent runtime directory was absent at startup or removed and recreated.
The UI could keep showing stopped while the companion was listening.

Run `python3 test/qml_cold_start.py` inside the Omarchy graphical session. It
loads the actual QML with synthetic idle state, synchronizes startup before
creating files, uses a unique named runtime and a fake control that records any
unexpected invocation. The unchanged v0.4.0 failed both missing-parent and
recreated-parent cases. The repaired source passed all five cases: existing
state, missing file, missing parent, recreated parent and still-absent state.
No control command was invoked, and no physical audio device was opened.

The repair retries state reads once per second only while no state timestamp
is available. It also clears failed-read freshness and suppresses expected
missing-file errors until the first load. Existing QML instance/control checks,
53 Node regressions and 15 Python regressions passed on Linux with Node `26.8.1`.
This is startup/state recovery proof, not a complete reboot, live speech or
permission matrix. Earlier live and installer evidence below remains bounded
to its stated version. A marketplace review of an older source snapshot does
not certify this patch automatically.

## v0.4.0 isolated installation and recovery tested on 14 October 2026

The exact attached v0.4.0 archive was exercised in a disposable Linux Crabbox VM,
`provider=aws`, lease `cbx_55fb69311044`, run `run_e18abb094f01`. Its SHA-256 was
`7ffb77e2dde4345ede28badc2d067c19b9d5fa176167e9d09ddf3faee3aef161`, matching
release commit `dc9bc653274c34985520fe5afb3d0030e574e741`. The VM used Node.js
`24.19.0`, Python `3.14.4`, systemd `259` and installed GStreamer dependencies.
The installer, launcher, dependency check and user service manager were real.
No installer subprocess or service-manager call was mocked.

| Exercised entrypoint/scenario | Observed result |
| --- | --- |
| Fresh root package placement and native manifest validator | Exactly one root manifest; copying the package created no companion, service or control socket |
| `python3 install.py`, then `--apply` in a clean companion installation | Preview changed no files; apply passed the real GStreamer check, verified 21 receipt-owned files and left the unit inactive/static |
| Installed `openclaw-voice status`, `stop`, then `systemctl --user stop openclaw-voice.service` | Actual unit started with capture off; cgroup contained only the daemon; stopping released its control socket |
| A second `install.py --apply` while that unit was running | Existing daemon stopped before replacement; installed file hashes/modes remained valid |
| `install.py --remove`, then `--remove --apply` | Preview preserved files; apply removed companion files, receipt and unit, preserving unrelated configuration and the separate plugin source |
| `install.py --restore MANIFEST --apply`, newest first | Undoing removal reproduced the installed bytes/modes; undoing upgrade and initial install returned the tested file surfaces to baseline, with the service stopped |
| A later edit to the installed launcher | Upgrade, removal and restore all refused; edited bytes and the real running daemon's PID were preserved |
| Explicit replacement of a pre-existing launcher and optional shortcut | Unapproved replacement refused; approved installation backed it up; removal restored original bytes/mode and preserved a later unrelated Hyprland edit |
| `python3 test/native_audio.py` | Generated-audio send/receive, mute, release and control-EOF checks passed with fake sinks; no physical audio devices were exposed |

All nine scenario groups passed. The VM ended with no companion unit or control
socket; the manually placed plugin source was moved outside discovery and backups
were retained. Evidence was downloaded and the lease was released.

The only Gateway was a local synthetic SDK fixture. It supplied connection
metadata and refused provider/agent requests; no real account, enrollment,
speech provider or permissions decision was exercised. This proves clean
companion installation and recovery with real user systemd, not a fresh Omarchy
OS installation or the graphical plugin manager's full lifecycle. Real Omarchy
QML and the opted-in live voice trial are recorded separately below. The working
desktop and Gateway were unchanged by this isolated run.

## v0.4.0 upgrade tested on 14 October 2026

| Component | Observed identity |
| --- | --- |
| Plugin and companion | Exact `v0.4.0` commit `dc9bc653274c34985520fe5afb3d0030e574e741`, tree `0ce06e46eca8010bb8907ea35e91b414d9817210` |
| Root plugin | `community.openclaw-voice`; one enabled voice plugin after retiring the legacy indicator and panel |
| Desktop | Omarchy `4.0.4-1`, Quickshell `0.3.1`, Node.js `26.8.1`, user systemd and native GStreamer/PipeWire audio |
| Remote OpenClaw Gateway | Main commit `9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa`, build version `2026.10.3` |
| Desktop Node and imported Gateway SDK | Released package `2026.9.4`, commit `3a9d69db306cd7f081e06254cb89c4bcc14a7107` |

The owner authorized upgrading the existing paired desktop. The exact release
checkout was installed using Omarchy's manual-plugin procedure. The released
installer replaced the old companion after backing it up, left the unit stopped,
and required a separate explicit service start. The installed companion source
matched the release, all 21 receipt-owned files matched their hashes and modes,
and the plugin checkout was clean at the release commit. OpenClaw configuration
and the existing shortcut files retained their bytes.

The native manifest validator accepted the package. `python3 test/qml_instances.py`
passed with real Quickshell components, synthetic state and fake controls,
covering instance isolation, literal control arguments, transcript/orb separation
and stale-state cleanup. `python3 test/native_audio.py` passed generated-audio
send/receive, packet-loss concealment, mute, release and control-EOF checks without
opening physical audio devices. The enabled bar icon was visible and no new
package QML load errors were found.

The release's 53 Node tests and 15 Python installer tests also passed again on
this Linux desktop with a temporary HOME/XDG environment, synthetic fixtures and
zero skips. These offline tests did not use the paired desktop configuration.

For the separate opted-in live trial, the operator started voice from the bar
and confirmed a spoken reply and both the user and assistant bubbles during a
desktop-action request. A single conversation overlay was observed. Manual Stop
returned the service to connected, idle state with capture off and captions
cleared; its systemd cgroup then contained only the daemon, with the call's audio
worker gone. The two disabled legacy plugin folders were retired through native
Omarchy removal and retained as verified backups outside plugin discovery.

The operator reported some slowness. One observed connection took about five
seconds to reach Listening; this is a single startup observation, not a complete
speech-to-action latency measurement or a diagnosed performance defect.

This proves an upgrade of an existing paired installation and the manual trial
above. It does not prove fresh Omarchy installation or enrollment, multiple
monitors, complete disable/re-enable/restart/failure/removal/restoration behavior,
or the full approval, denial, cancellation and revocation matrix. The live
desktop's backups were verified without restoring them; the separate VM run
above exercised installation/removal restoration. No released OpenClaw minimum or
future-main compatibility guarantee is established. Private configuration,
captions and audio are not published as evidence.

## Earlier main-build trial on 14 October 2026

| Component | Observed identity |
| --- | --- |
| Remote OpenClaw Gateway | Main commit `9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa`, build version `2026.10.3` |
| Desktop Node and imported Gateway SDK | Released package `2026.9.4`, commit `3a9d69db306cd7f081e06254cb89c4bcc14a7107` |
| Installed voice service | Retained `0.3.4` installation; audio engine, session owner, transcript handling and QML match repository main at `57e55f89f972d08b45cc99f3b005cffb1ca1fcd8` |
| Speech and desktop | Native Omarchy bar widget, GStreamer/PipeWire, gateway-controlled WebRTC and agent consultation |

The Gateway contains the merged [voice/text permission fix](https://github.com/openclaw/openclaw/pull/159697)
and [Talk consultation lifetime fix](https://github.com/openclaw/openclaw/pull/170083).
The latter prevents a later consultation from inheriting a finished voice-setup
request's cancelled lifetime.

The operator started the original bar widget and successfully opened a desktop
application through a spoken request. After correcting a retained test-instance
panel selection and restarting the Omarchy shell, another manual call succeeded.
Both user and assistant captions reached the service, the conversation overlay
was present, and the operator confirmed the widget worked. Manual Stop returned
it to connected, idle state with microphone capture off and captions cleared.
See [returning from a test instance](INSTANCES.md#returning-from-a-test-instance).

A separate trial through the Gateway's normal chat and Talk interface completed
the same desktop command with the same approvals. This is evidence for that
tested route, not a complete permission matrix for every widget action.

This was an existing installation, not a clean installation of repository main.
Its configuration loader, connection wrapper and launcher predate main's named
instance and connection-diagnostic additions. Those newer wrappers were not
exercised by this live trial; do not replace them with the older installed files
or describe the trial as proof for an unchanged full checkout. The separate
marketplace-preparation package was not installed or tested in this trial.

The version label identifies a tested main build, not a verified stock
`2026.10.3` release or a guarantee for future main commits. Clean-install,
upgrade/removal and the full approval, denial, cancellation, revocation and
reconnect matrix remain separate release checks.

## Candidate tested on 23 September 2026

| Component | Tested identity or requirement |
| --- | --- |
| OpenClaw Gateway, desktop Node and imported Gateway SDK | Commit `af640b6de9de6894c6f81acc53e35d43b371fe9b` |
| OpenClaw build | `2026.9.5-af640b6de9de-2026-09-22T11-18-39.000Z` |
| Related upstream work | [OpenClaw PR #153299](https://github.com/openclaw/openclaw/pull/153299) |
| Desktop | Omarchy with Lua Hyprland configuration and Quickshell plugins |
| Voice service | Node.js 22+, Python 3, PyGObject, GStreamer and PipeWire |
| Speech path | Gateway-controlled WebRTC, GPT-Live ChatGPT OAuth and agent consultation |

The upstream PR remained a draft when this evidence was recorded. The tested
commit was a reviewed candidate, not a published compatibility guarantee.
Check the upstream release before choosing a minimum released version.

An operator confirmed an app launch after spoken approval. A separate denial
left the app closed. Both transcript bubbles and the boxed status were readable.
The widget returned to connected, idle state after the tests.

These observations cover the basic approval and cancellation interaction.
They do not prove a complete policy, expiry, revocation or replay matrix.
No reusable app-launch policy was configured for this test.
Earlier candidate evidence does not automatically apply to this build.

The test used a remote Gateway and a desktop Node. A complete conversation with
a local Gateway and local OAuth remains unverified. See [local Gateway validation](LOCAL-GATEWAY.md).

## Pinned-main comparison staged on 25 September 2026

Gateway, desktop Node and SDK were staged together at exact commit
`b770a861bd80a15ec04eee5a4ac7053ddd0079c2`, using the existing v0.3.4 widget.
The connection was established with microphone off. Human spoken yes/no testing
is pending; no main voice or app-launch success is claimed. This staging does
not validate the new one-root package or establish a released minimum.
The earlier `af640b6` human smoke remains separate evidence.

## Offline evidence and package limits

The marketplace preparation has Linux offline regression tests for bounded SDP,
Stop/deadline cancellation, instance selection and companion file installation,
upgrade, removal and guarded restoration. See [preparation evidence](MARKETPLACE-PREP.md)
for the final counts, source identities and limits.

The Python installer unit tests use real disposable files and mocked systemd/audio-check
commands. Those unit tests alone prove no real service-manager or desktop lifecycle;
the separate v0.4.0 VM run above exercised real user systemd. Prior v0.3.4
evidence does not automatically validate this consolidated package. The newer
v0.4.0 upgrade and QML/native-audio checks above provide bounded desktop evidence;
the remaining full lifecycle procedure is separate. No physical audio or live
provider is used by automated tests.

## Check an installation

1. Confirm the OpenClaw Gateway, desktop Node and SDK versions independently.
2. Run `openclaw-voice status` to inspect the actual connection and imported SDK.
3. Run `openclaw-voice preflight` before starting a conversation.
4. Check that the status is connected and the microphone is off.
5. Start a call manually to check the hardware and spoken approval flow.

Preflight checks available configuration and voice readiness. It is not a
substitute for a complete conversation on the selected OpenClaw build.
Status fields that the Gateway does not provide remain unknown.
Do not infer authentication from the presence of a paired-device file.

The widget does not install OpenClaw or bypass its confirmation rules.
An app-launch test also needs a paired desktop Node with the required commands.
Use OpenClaw's supported setup for those permissions.

## Establish a released minimum

After the required fixes enter an OpenClaw release, test that released package.
Check Gateway, desktop Node and SDK compatibility on a clean installation.
Record the exact versions, install/removal results and spoken-test limits here.
Then replace the candidate requirement with the tested release number.
Keep basic voice compatibility separate from app-launch compatibility if their requirements differ.
