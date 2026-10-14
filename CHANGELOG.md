# Changelog

## 0.4.0 — 14 October 2026

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
