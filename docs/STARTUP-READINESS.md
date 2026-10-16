# Startup readiness and recovery

The existing companion keeps its Gateway connection while idle. This change
preserves that reuse; it does not add a new warm-connection optimization. It adds
observable startup milestones, a stricter ready gate and actionable failures.
Existing recovery from absent or recreated runtime files remains in place.
These additions are included in the v0.5.0 preview. Earlier v0.4.1 contains
runtime-file recovery only.

| Compact feedback | What has actually happened |
| --- | --- |
| Connecting to Gateway · Microphone off | The companion is connecting; no voice activation or microphone start follows automatically. |
| Preparing voice | The local worker, configuration checks, provider reservation or local audio setup is in progress. The detail names the current observed step. |
| Connecting · Wait for Talk | The voice exchange or transport is pending, or microphone/Talk readiness has not yet been confirmed. |
| Ready · Listening | The worker has observed microphone frames, native WebRTC transport is connected, and the current Talk session has reported readiness. |
| Ready · Input muted | The same readiness gate passed, but input mute is acknowledged. Readiness does not unmute input. |
| Component-specific failure | Startup or the call failed; input is released through the existing owner, and a separate recovery action is shown. |

The amber-to-green transition and Ready text are the subtle visual ready cue.
No sound, automatic speech or new audio stream is added. Early text, a provider
readiness event alone, or a native connection alone cannot advertise Listening.
Frames containing silence still establish capture readiness; software cannot
infer whether a hardware switch silences the selected input from that fact.

Failures distinguish Gateway connectivity, structured pairing/authentication and
version errors, voice configuration, ChatGPT OAuth policy, provider readiness or
reservation, native dependencies, audio setup and the connection exchange.
Guidance is a closed local vocabulary. Unknown upstream failures use the known
stage's generic recovery action; raw error messages, URLs and library diagnostics
are never used as UI text. Gateway detail-code mapping follows public revision
`9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa` and its
[structured connection error contract](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/packages/gateway-protocol/src/connect-error-details.ts).

A Gateway reconnect can clear a resolved connection failure only after local
audio release is confirmed. It never starts the microphone, resumes a call or
resubmits a request. A launcher that observes an explicit connection failure
before sending activation leaves the recovery message visible. Stop and startup
timeouts retain the existing cancellation and late-grant cleanup rules.

## Private timing diagnostics

Run `openclaw-voice diagnostics` against an already running companion. This
command does not start a service or microphone. It reports only bounded timings,
closed milestone names, current readiness and sanitized failure codes. The
ordinary `status` command also contains private current captions and connection
metadata; do not treat its entire response as a shareable diagnostics record.

| Field | Measured boundary |
| --- | --- |
| `invocationToReadyMs` | Launcher entry to the three-part ready gate, using the Linux monotonic clock. A direct socket call without valid timing metadata starts at command acceptance. Wake activation starts at detection, rather than including time spent waiting in standby. |
| `localWorkerPreparationMs` | Command acceptance to the local worker's ready event, including serialized owner cleanup before launch. |
| `gatewayChecksMs` | Configuration and readiness RPC checks; network and Gateway time are combined. |
| `providerReservationMs` | Provider-session reservation RPC, including its network/Gateway/provider delay. |
| `connectionExchangeMs` | SDP exchange through receipt of the answer; network and provider delay are combined. |
| `requestToFirstReplyMs` | Matching Talk turn's observed input marker to first received output text or output-audio-start event. This is speech-path responsiveness, not host-action completion. |
| `requestMarker` | `speech_commit` when observed, otherwise `transcript_final`; the latter is a transcription-time proxy, not the physical end of speech. |
| `agentWorkMs`, `networkOnlyMs` | Unavailable (`null`): this route does not expose an authoritative host-work boundary or isolated network timing. |

Invocation timing excludes time before the launcher process enters its main
function. Invalid, future or more-than-two-minute-old invocation timestamps are
ignored. Timings are rounded monotonic durations, not progress percentages.

First-reply timing requires a matching turn identifier. Missing correlation,
missing markers and transcription arriving after the reply produce `null` with
an unavailable reason. Duplicate/older sequence numbers do not produce a new
measurement. No completion or cancellation is inferred from provider events.

The recorder holds at most 24 milestone entries and eight in-memory turn
correlations for the latest activation. No turn identifiers, text, speech,
secrets, endpoints or absolute clock values appear in the diagnostic output.
A new activation resets it; stopping retains the last measurements alongside
current `ready: false`. Nothing is appended to a history or uploaded.

If the companion cannot load its initial configuration or Gateway SDK before
acquiring its control socket, runtime diagnostics are unavailable. The existing
missing/stale-state UI remains unknown; inspect private service status rather
than assuming a startup milestone was reached.

## Validation

The Linux checks use synthetic Gateway/media events, generated audio and fake
sinks. They cover capture/transport/Talk readiness ordering, staged preparation,
timeouts, late callbacks, fast reconnect during release, typed configuration and
provider failures, bounded diagnostic privacy and correlation limits. Native
media checks observe the first microphone-frame acknowledgment and actual
generated playback through Quiet/resume and independent input mute. The real
Omarchy renderer checks preparation, ready/muted cues, recovery layout, stale
state, instance isolation and all five runtime-file startup scenarios.
All 86 Node tests and 27 Python tests passed on Linux without skips.

These checks exercise neither physical devices nor a live provider. They establish
the measured boundaries and failure handling, not improved latency, battery life
or a supported minimum released Gateway version. The normal installation and
Gateway are unchanged.
