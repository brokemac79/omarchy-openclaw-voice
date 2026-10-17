# 0.6.0 hardening validation

This audit compared the published 0.6.0 archive with the installed companion
and plugin, then tested the fixes accompanying this report on 17 October 2026.
The release baseline is commit `8af3fd725f7db2ff0e685e37de705d9c26c93cf5`.
The installed release was left unchanged. These fixes require a later upgrade.

## Findings and fixes

| Finding | Reproduction and correction |
| --- | --- |
| Native shutdown can abort the interpreter | With stdin kept open, the released audio worker exited abnormally in 20 of 20 generated-input SIGTERM trials. A diagnostic repeat confirmed SIGABRT and a fatal Python shutdown error. Replace the blocking buffered-stdin thread with a bounded GLib input watch. Use the same parent-closure approach for wake. Twenty fixed audio shutdown trials exited cleanly. |
| Hold release hides continuing reply captions | The state writer discarded captions for `input-muted`, and the QML conversation panel excluded that state. Preserve captions and show the panel while input stays muted. Regression coverage follows the real owner/state writer into the actual Omarchy renderer. |
| A failed late worker release allows replacement audio | Cancel startup, request a replacement, then resolve the old worker with a failing close. Latch unconfirmed release, stop the replacement and show the actionable fixed error code. |
| Daemon shutdown can strand a worker still starting | The parent exited before a cancelled launch acquired and released its worker. Wait for startup and media cleanup before exit. A real daemon/fake delayed worker regression verifies release and process disappearance; twenty repetitions passed. |
| Hold command replies describe the previous state | Status was evaluated before applying press, renewal or release. Apply the operation first; daemon tests assert the immediate accepted press/release snapshots. |
| Invalid configuration can expose supplied values | JSON parser errors can quote private configuration; URL errors can retain the supplied origin. Replace these with fixed messages, reject non-object configuration roots and retain no raw error cause. Tests use synthetic markers only. |
| Audio workers inherit unrelated credentials | Replace full environment inheritance with a local audio/Python runtime allowlist. Gateway/provider credential variables remain in Node. This reduces inheritance; it is not an OS sandbox. |

## Automated checks

- All 140 Node tests and 38 Python unit tests passed on Linux with zero skips.
  Twenty consecutive full Node runs also passed: 2,800 test executions.
- Actual generated WebRTC checks covered input/output, Quiet and resume,
  independent input mute, hold release with continuing playback, native lease
  expiry, refusal of late renewal and control EOF cleanup.
- Actual local tones covered bounded samples, completion, cancellation and
  process release, using fake sinks. Wake tests used generated input and a fake
  predictor, including SIGTERM with open stdin, parent EOF and control input.
- Eight native process/protocol cases covered ready/startup SIGTERM, partial
  stdin, Stop, malformed JSON, nested JSON, oversized frames and EOF.
- All nine Omarchy renderer fixtures passed: cold start, wake states,
  interruption controls, action cards, destinations, answer reader, audio
  settings, hold controls and named-instance isolation. They used synthetic
  state, real components and fake controls. The answer test also exercised
  keyboard, pointer selection, clipboard restoration and short-screen layout.
- The actual Unix control transport survived 1,024 concurrent malformed or
  fragmented requests and 16 oversized frames. Errors stayed fixed and the
  original owner remained reachable afterward.

The hosted workflow now runs the native process, generated WebRTC, hold, tone
and fake-predictor wake checks as a separate Linux job. They supplement the
existing Node/Python and publication gates without requiring audio hardware.

## Service and integration checks

A disposable Linux user with a real user-systemd manager passed preview,
0.5.0 installation, idle start, upgrade to 0.6.0, interruption of a generated
tone, cgroup cleanup, removal and three newest-first recovery manifests.
Configuration and unrelated shortcut content survived. Later edits blocked
upgrade, removal and recovery before the running service was stopped. The fixed
candidate also passed installation and five tone/stop/restart cycles. The SDK
was a synthetic fixture; no account credentials or real audio devices were used
in this environment. Installation did not start or enable the service.

Live integration used an isolated named silence-only daemon against the existing
Gateway. The installed release passed one cycle and the fixed candidate passed
three cycles of WebRTC readiness, mute, End voice and immediate startup
cancellation. Output used fake sinks. The normal service was restored connected
with voice inactive, and temporary instance configuration/runtime was removed.
The final shutdown correction was checked with three more live candidate cycles;
no native audio, tone or wake worker remained afterward.
This checked Gateway 2026.10.3 with the installed SDK 2026.9.4, in addition to
offline tests on Node 24 and Node 26 with Python 3.14.

## Limits

No automated check opened a physical microphone or speaker. These results do
not qualify real speech recognition, echo cancellation, audible volume, wake
model accuracy, everyday latency or hardware-specific device switching. Those
still need a short human check on the upgraded release before advertising it.
The existing limits on correlated host completion/cancellation and recovery of
backend-only results remain unchanged.
