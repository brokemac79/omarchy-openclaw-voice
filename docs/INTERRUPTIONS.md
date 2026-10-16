# Voice interruption controls

Right-click the bar icon to open Voice controls. The ordinary left click still
starts or ends voice. Opening or closing the controls panel does not start audio.
Use the same configured instance wrapper for all commands.

| Control | Command | Effect |
| --- | --- | --- |
| Mute input / Unmute input | `openclaw-voice mute` | Changes microphone transmission; playback and host work continue. In wake standby, mute disarms the detector. |
| Quiet | `openclaw-voice quiet` | Silences local speech playback until Resume speech, without muting input, ending Talk or cancelling host work. |
| Resume speech | `openclaw-voice resume-speech` | Makes subsequent incoming speech audible; discarded quiet audio is not replayed. |
| Cancel request | `openclaw-voice cancel-request` | Currently unavailable for this native connection; returns an explicit unavailable outcome without sending a broad abort. |
| End voice | `openclaw-voice end-voice` (or `stop`) | Releases local capture/playback and closes the selected voice session. Submitted host work may continue. |
| Dismiss results | `openclaw-voice dismiss-result` | Clears retained text and action observations without changing audio or work state. |

Quiet is an idempotent output command, separate from the input-mute toggle.
Playback can have a short device-buffer tail. It stays quiet across later provider
responses until explicitly resumed or a new call starts. Input and output controls
show the native worker's acknowledged state, with an updating label while a change
is pending. These in-call commands never start a companion service on failure.

End voice, errors and disconnect release the local audio owner. They do not
prove that submitted work completed or was cancelled. The controls therefore show
**Work status unknown**. Provider `turn.ended` and `turn.cancelled` events describe
a spoken response; this app does not treat them as host-request terminal events.
Repeated Quiet/End controls, late old-call callbacks and startup changes do not
reopen input or target another request.

Text deltas and final text continue while speech is quiet. The latest received
final assistant text is retained as a bounded, plain-text excerpt in the private
runtime state after End voice or audio delivery failure. Open Voice controls to
read it. This is received text, not proof that an action completed. It is cleared
by Dismiss results, the next explicit call or companion shutdown; no history or
recording is added. Text that never reached the companion cannot be recovered
here. The Gateway's own fallback text delivery remains untouched.

## Request cancellation is outside this feature

The source audit uses the same public OpenClaw revision as the deployed Gateway:
`9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa` (build `2026.10.3`).

- [`talk.client.steer`](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/handlers/client.ts)
  delegates to the real run controller but selects an owned run by session.
- [Run ownership](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/run-ownership.ts)
  explicitly distinguishes that session-wide RPC from the exact voice-session
  selector used by attached provider controls. The RPC has no exact request
  selector that this companion can safely bind to a button click.
- [`talk.session.cancelOutput`](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/handlers/session.ts)
  requires the realtime-relay route. This app uses native WebRTC, not that route.
- [Native attached controls](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/client-gateway-control.ts)
  do use an exact voice-session selector. The Gateway retains its existing spoken
  cancel path; say "cancel" during Talk and check its response. The companion does
  not infer a cancellation outcome from that response's caption text.

The Cancel request button stays disabled. Its socket command returns
`cancellation.outcome: "unavailable"`; a successful socket exchange is not a
successful cancellation. It does not use whole-session `chat.abort`, inject
invented transcripts, end voice as a substitute, or claim completion from provider
events. A completed action cannot be undone by cancellation.

Enabling the button requires an upstream, authenticated control bound to both the
selected voice session and exact admitted request, with correlated outcomes.
That contract must distinguish cancellation accepted, already completed,
rejected and unknown, survive cancellation/completion races, and prevent a late
click or retry from cancelling replacement work. At the owner's request,
exact-request cancellation is outside the scope of issue #2. This implementation
provides independent media controls and a truthful unavailable state; it does
not implement host-work cancellation.

## Validation

Automated tests use fake Gateway events, generated audio and fake sinks. On the
Surface, 78 Node tests and 25 Python tests passed on Linux without skips. The
real GStreamer/WebRTC peer test checks actual fake-sink samples: Quiet silences
output while the generated microphone signal still reaches the peer; Resume
restores playback, and input mute leaves that playback running. EOF and End
release the synthetic worker.

`python3 test/qml_controls.py` uses the actual Omarchy renderer with synthetic
state and a fake launcher. It checks literal per-instance command arguments,
disabled Cancel, refusal of stale input/output controls, available End voice and
panel height. Existing instance, wake-state and all five cold-start fixtures also
pass. These checks do not open physical audio devices or exercise a live provider
or a successful host-work cancellation. The normal installation is unchanged.
