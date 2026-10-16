# Action observations and the missing execution contract

This delivers the owner-approved scope of [the action-observations feature](https://github.com/brokemac79/omarchy-openclaw-voice/issues/4):
Heard/Outcome unknown cards and retention of final text already received.
The owner accepted the limits below for closeout. Verified host execution
progress/results and recovery of undelivered backend results are outside this
scope. The native Talk connection does not expose the required execution binding.

## Current behavior

A final user transcription with a valid Talk turn identifier and sequence can
show **Heard**. This confirms transcription only. The card explicitly says that
action start and completion are unverified. A subsequent response, provider
terminal event or tool event for that turn shows **Outcome unknown**. An
acknowledgment never produces Working, Completed or Cancelled.

The existing speech status says **Responding** while OpenClaw sends a reply.
Speech captions and action observations remain separate. A provider's statement
that an action succeeded is still a caption, not execution evidence.

The compact conversation shows the latest observation and a count of earlier
unknown outcomes. The deliberately opened controls show up to four cards and
the existing last received final text. Longer controls scroll within the screen.
Quiet, input mute and End voice keep their separate meanings; none cancels work.
End, failure and disconnect leave observations unknown and retain already
received final text. Stale UI hides observations rather than presenting live
evidence. A new call, explicit Dismiss results or service shutdown clears visible
results. Dismiss retains event deduplication for the current call.

Cards contain local turn numbers and closed status values only. The in-memory
correlation ledger holds at most 32 Talk turn identities per call. When it fills,
new identities receive a visible additional-unknown indication; old identities
are not evicted and reassigned to a different request. Only four cards are
exported to private volatile runtime state. Older observations have an explicit
unknown count. No audio, caption history, identifiers or execution payloads are
added to cards or diagnostics.

## Upstream source audit

Checked public OpenClaw revision
`d6d7435f59ec2c5aba5b7f571815a1def75a404c` on 16 October 2026. This is source
evidence, not a deployed-version or live-provider test.

- The [Gateway-control owner](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/gateway/talk/client-gateway-control.ts)
  broadcasts `talk.event` with the voice-session identity. Its harness disables
  bridge-event capture. `runConsult` awaits host work and submits its text to
  the provider, without publishing a client-visible consultation/run result
  binding through this native route. The native-delegation callback has the
  same missing external binding.
- The [response harness](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/talk/realtime-session-harness.ts)
  ends or cancels a Talk turn on a provider response outcome. That boundary is
  independent of the host consultation and cannot establish work completion.
- The [Talk event definitions](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/talk/talk-events.ts)
  include tool events and turn identifiers. Their presence in the vocabulary
  does not establish native-route delivery or bind a terminal result to the
  submitted host request.
- The separate [agent-consult entry point](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/gateway/talk/agent-consult.ts)
  can return an admitted run identifier to its RPC caller. The native companion
  does not call that RPC: its provider delegates through the Gateway owner.
  A run from the same text session is insufficient evidence of ownership by
  this voice request. Do not attach unrelated chat/agent events to these cards.

## Contract required for future execution tracking

The Gateway must expose an authenticated, connection-scoped binding between
voice session, consultation/request and execution attempt. It must provide
authoritative admission and terminal outcomes with ordered/replayable event
identity, plus a bounded result snapshot or recovery query for missed delivery.
Define retry identity, cancellation-versus-completion precedence, detached work
after End voice, and replacement/disconnect behavior. A tool's exit code is a
tool outcome; it does not automatically establish whole-consultation success.

Only then can the companion display Working, Completed or Cancelled, or attach
an exit code/output to the right consultation. The current patch intentionally
has no synthetic production API or dormant success path. Tests exercise the
events the companion actually receives, including fake success-shaped payloads
that must remain unknown.

Already received final Talk text is retained if audio ends or is silenced.
Recovering a backend answer that never reached this native client remains part
of the missing result contract. This patch neither suppresses backend fallback
delivery nor changes the separate upstream duplicate-presentation report. Two
rendered texts are not evidence of duplicate execution.

## Offline validation

Run `npm test`, the Python unittest suite and `python3 test/qml_action_cards.py`
in an Omarchy graphical session. The renderer fixture sends synthetic Talk
events through the real owner and state serializer, then reads that state in
the real components. It covers Heard/unknown, speech separation, retained text,
bounded overflow, stale controls, scrolling, new calls and dismissal. No test
opens physical audio devices, calls a provider or executes a host command.
