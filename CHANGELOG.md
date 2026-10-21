# Changelog

## Unreleased

- Make the icon and launcher arm local Standby when wake is enabled; require
  detection before Talk and stop on a repeated click during startup or either mode.

- Wait for initial destination discovery before validating click/wake activation,
  keep pending starts cancellable, and clear recovered destination errors without
  reopening audio. Qualify Omarchy theme colours for newer Qt/Quickshell renderers.

- Add spoken return-to-standby commands and a configurable inactivity timeout
  for wake-started conversations, defaulting to 30 seconds (0 disables it).
  Wait through pending replies and playback; preserve received answers and
  cancel rearming on Stop, failure, disconnect or a replacement call.

- Restore the compact voice bar icon by default, with an optional bounded agent
  label. Keep hover details in a short multiline tooltip without repeated
  destination text; prevent labels from painting beyond narrow or vertical slots.

## 0.6.1 - 19 October 2026

- Release the test-tone helper's GLib callbacks and bus watch on completion or
  startup failure, before Python interpreter shutdown. Add repeated synthetic
  completion, SIGTERM and EOF coverage for the separate tone process.

- Fix native audio shutdown with open control stdin and stop malformed or
  oversized commands safely. Release wake input without a blocking stdin thread.
  Wait for late worker release before exiting a stopped daemon.
- Keep continuing hold replies visible in compact captions, return current hold
  state from controls and block replacement audio after an unconfirmed release.
- Sanitize invalid configuration/origin errors and keep Gateway/provider
  credential environment variables out of the native audio process.

## 0.6.0 - 17 October 2026

- Add explicit touch/keyboard hold-to-talk with verified readiness, independent
  input leases, lost-release recovery and configurable mute-or-End release.
  Default release keeps capture open with transmission muted and replies audible.

- Add explicit microphone/speaker device selection with private saved preferences
  and a local two-second test tone. Block overlapping audio owners, show missing
  selections, stop on stale or changed bindings and preserve explicit activation.
  Microphone checking and input metering are deferred by owner choice.
- Add an explicitly opened answer reader with scrolling, text selection,
  copying, text sizing and deliberate HTTP/HTTPS link actions. Keep a bounded
  beginning of received replies separately from compact caption tails, with
  explicit partial/overflow state and retention after End or audio failure.
  Dismissal, a new call and companion shutdown clear this volatile text.

## 0.5.0 - 16 October 2026

- Add opt-in local wake-to-conversation activation with separately provisioned
  models. The configured OpenClaw phrase accepts both word-boundary spellings;
  Standby is explicit local microphone capture, disabled by default.
- Separate input mute, local speech Quiet/resume and End voice. Retain final
  text already received when playback is quiet or the call ends.
- Show observed Preparing voice/Connecting stages, strict microphone/transport/
  Talk readiness and static recovery guidance. Expose bounded, speech-free
  monotonic diagnostics through a separate local command.
- Distinguish spoken Responding feedback from Heard/Outcome unknown cards.
  Provider acknowledgments never claim completed or cancelled host work.
- Display the selected agent and node/conversation context, with deliberate
  presets resolved from existing Gateway destinations. Preserve explicit
  review boundaries, private selection persistence and old-call event isolation.
- Add contributor templates and the project vision; keep privacy publication
  checks and OMA/OpenClaw attribution intact.

This is a full release, with manual companion setup and optional model provisioning.
Verified host execution/completion/cancellation and recovery of backend results
that never reached the client remain unsupported. Automatic return to wake
standby after one request remains disabled pending a correlated completion
contract. See [compatibility](docs/COMPATIBILITY.md), [wake limits](docs/WAKE-WORD.md),
[interruption controls](docs/INTERRUPTIONS.md), [action observations](docs/ACTION-PROGRESS.md)
and [destinations](docs/DESTINATIONS.md). No new live voice or full graphical
plugin-manager qualification is claimed for this tag; exact source identity,
automated results and archive checksums are recorded in its release notes.

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
