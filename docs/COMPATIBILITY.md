# Tested compatibility

This integration is under development. A released minimum OpenClaw version is
not yet established. Do not interpret the candidate's version label as a
supported range such as `>=2026.9.5`.

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

## Offline validation for this revision

Linux validation passed 46 Node tests and 8 Python tests without skips.
The Python checks include isolated installation, upgrade and restoration from backup manifests.
That installer check uses temporary directories and mocked desktop commands.
It does not install a real service or prove service-manager removal.

Both manifests passed the installed Omarchy validator. The actual QML components
passed synthetic checks for instance isolation, controls, status and stale-state cleanup.
Native audio checks passed send, receive, packet-loss concealment, mute and worker release
using generated audio and fake sinks. Automated checks used no physical audio devices.

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
