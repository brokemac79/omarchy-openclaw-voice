# Changelog

## 0.4.1 — 16 October 2026

- Recover the bar state and conversation captions when the companion runtime
  directory is created after shell startup or removed and recreated.
- Retry unavailable state reads once per second without starting the companion
  or requesting audio; suppress expected missing-file warnings until first load.
- Add a synchronized real-QML regression for five startup/recovery scenarios.

The old missing-directory failure and repaired behavior were exercised on
Omarchy with synthetic state. Existing QML instance checks, 53 Node tests and
15 Python tests pass. No automated physical audio or live provider was used.
See [proof and limits](docs/COMPATIBILITY.md#v041-startup-recovery-tested-on-16-october-2026).

## 0.4.0 â€” 14 October 2026

Initial preview release of the native Omarchy interface for OpenClaw.

- Start and stop voice from a themed bar control, with live user and assistant
  speech bubbles and an optional audio orb.
- Use the existing OpenClaw Gateway, ChatGPT OAuth speech path, selected agent
  and ordinary approval routing. No direct adapter for other agent services.
- Consolidate the interface into the root `community.openclaw-voice` package,
  with the bar entry owning its conversation display and instance selector.
- Bound streamed SDP replies and cancel them on Stop, failure or deadline.
- Provide explicit preview/apply companion setup, optional shortcut replacement,
  backups and guarded upgrade, removal and restoration.
- Preserve OMA and OpenClaw MIT attribution and the existing synthetic preview.

Linux offline tests cover runtime behavior and disposable installer fixtures.
The manual main-build voice trial used the previous installed layout. Clean
Omarchy installation, migration, QML and real service-manager lifecycle checks
for this consolidated package remain pending. See
[compatibility](docs/COMPATIBILITY.md) and [release checks](docs/RELEASING.md).
