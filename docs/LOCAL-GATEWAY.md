# Local OpenClaw support

Version 0.3.3 supports an OpenClaw gateway running on the same Omarchy machine.
The initial version assumed a remote secure gateway; this version selects the
gateway from OpenClaw's local/remote mode and supports authenticated loopback
WebSocket and HTTP connections.

## Setup

Keep the existing OpenClaw gateway running normally. Its configuration should
select `gateway.mode: "local"`. The voice app uses `gateway.port`, with `18789`
as the default, and reads the existing gateway token or password. There is no
need to copy that credential into the voice app's own configuration.

The gateway must listen on loopback. A gateway bound exclusively to a different
interface should be configured as a remote target instead. Non-loopback targets
require TLS. Existing device permissions and pairing rules remain enforced by
OpenClaw; the app does not approve itself or change gateway authentication.

Configure GPT-Live ChatGPT OAuth in that local OpenClaw installation, select an
agent with the voice app's optional `sessionKey`, and configure `gatewaySdk` if
the OpenClaw package is outside the default dependency directory. These settings
are described in the [README](../README.md).

After installing, run:

```sh
openclaw-voice status
openclaw-voice preflight
```

The status should show a connected gateway with the microphone off. Preflight
checks the gateway's visible OAuth configuration and realtime readiness without
starting a voice conversation. Then use the bar icon or Super+Shift+V for a
spoken test.

GPT-Live still connects to OpenAI over the internet. A local OpenClaw gateway
does not make the speech model local or offline, and OAuth must be available on
that gateway. API-key speech fallbacks remain prohibited by this app.

## Validation on 19 September 2026

| Check | Result |
| --- | --- |
| Real OpenClaw 2026.9.4 gateway running locally | Connected |
| Local gateway token authentication | Passed |
| Local gateway password authentication | Passed |
| Authenticated `config.get` and `talk.catalog` RPCs | Passed with both auth modes |
| Voice preflight without ChatGPT OAuth | Rejected as intended |
| Loopback HTTP SDP offer and answer, synthetic data and fake worker | Passed |
| Non-loopback plaintext, credential-bearing URLs, invalid ports | Rejected in automated tests |
| Explicit local mode with an old remote URL still present | Selected the local gateway |
| Remote mode without a remote URL | Rejected instead of selecting a local agent |
| Local credentials sent to a remote gateway | Prevented in automated tests |
| Full GPT-Live conversation using local ChatGPT OAuth | Not yet tested |

The real gateway checks used separate temporary homes, configuration, runtime
directories and ports. The profiles had no provider credentials, channels,
browser automation or enabled cron jobs. All test gateway and voice processes
were stopped afterward. No physical microphone or speakers were opened, and
the existing VPS configuration was not changed.

The remaining full-conversation check requires a local OpenClaw installation
with working ChatGPT OAuth. The existing VPS connection has separate synthetic
voice-session proof; it is not evidence of an end-to-end local OAuth session.

OpenClaw documents the default loopback connection and local/remote topology in
its [gateway connection guide](https://docs.openclaw.ai/gateway/remote).
