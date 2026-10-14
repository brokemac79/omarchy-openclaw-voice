# Tested compatibility

This integration is under development. A released minimum OpenClaw version is
not yet established. Do not interpret the candidate's version label as a
supported range such as `>=2026.9.5`.

## Main build tested on 14 October 2026

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

The installer tests use real disposable files and mocked systemd/audio-check
commands. They prove no real service-manager or desktop lifecycle. Prior v0.3.4
QML/native-audio evidence does not automatically validate this consolidated
package. The updated QML harness still needs an isolated Omarchy/Quickshell
session. No physical audio or live provider is used by automated tests.

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
