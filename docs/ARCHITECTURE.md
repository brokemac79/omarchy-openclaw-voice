# Native voice architecture

## Decision

Use OMA's Quickshell interface, a Node service for OpenClaw gateway ownership,
and a short-lived Python/GStreamer worker for audio. Keep WebRTC for the live
media path. Use a private Unix socket for local controls. Chromium, Playwright,
HTML, HTTP endpoints and browser device identifiers have been removed.

```text
Shortcut / OMA bar -> private Unix socket -> Node / OpenClaw GatewayClient
                                             |          |
                                      private stdio     authenticated WS/WSS
                                             |          |
                                      GStreamer     OpenClaw agent
                                             |          |
                                      WebRTC audio <--- OAuth session grant
                                             |
                                PipeWire microphone / speakers
```

## Why these components

- **OMA / Quickshell:** the existing native, themed, click-through desktop UI.
  Its MIT code and attribution remain in the distributed plugin.
- **GStreamer:** a maintained Linux media framework with a native WebRTC stack,
  Opus, capture/playback and WebRTC echo/noise processing. It avoids launching
  and automating a general-purpose browser for every conversation.
- **PipeWire through PulseAudio elements:** uses the desktop's existing audio
  routing and stable device names. No separate sound server or global device
  configuration is installed. Echo cancellation uses a playback probe in the
  same pipeline as capture.
- **WebRTC:** keeps encrypted, low-latency, full-duplex media and the gateway's
  working GPT-Live client transport. Changing from a browser does not require
  inventing another audio protocol. OpenClaw's alternative gateway PCM relay
  returned a provider response-ownership error during the deployment probe;
  no shared gateway patch is required for this working client path.
- **Node GatewayClient:** retains OpenClaw's existing paired-device auth and
  session/agent controls instead of recreating its authentication protocol.
  A local gateway uses authenticated loopback WS and HTTP; remote gateways
  require WSS and HTTPS unless reached through a loopback tunnel. Initial
  token/password credentials come from the selected gateway's configuration.
- **Unix socket + stdio:** standard local process interfaces. No loopback web
  server, browser token, SSE channel or network-accessible control endpoint.

The tradeoff is that this implementation is Linux-specific and requires native
GStreamer packages. Device selection and echo cancellation need physical audio
validation on each machine. This decision does not claim that every native
pipeline is automatically faster or acoustically better than Chromium.

## Ownership and failure handling

The service reserves a gateway-controlled `gpt-live-1-codex` session only after
checking visible OAuth configuration. The worker then opens audio. Stop closes
the worker immediately and releases the gateway reservation, including late
reservations from a cancelled startup. A replacement waits for cleanup.

Mute is queued during startup and applied before transmission. The UI reports
mute only after native confirmation. Mute transmits silence; Stop releases the
input device. Audio errors, missing heartbeats and gateway disconnects stop the
call. Reconnecting the gateway never automatically reopens the microphone.
Systemd owns the entire process group, and worker stdin EOF also stops capture.
A Linux abstract socket acts as a kernel-held ownership lock while recovering
a stale control socket. Systemd does not remove the shared runtime directory,
so a rejected duplicate cannot disconnect the existing daemon.

Only current captions and levels are stored in volatile private runtime files.
Talk deltas are accumulated separately for the user and assistant; final events
replace the partial utterance. Sequence numbers reject repeated or older text.
The top-right bubbles render plain text and clear on stop or failure. They are
part of the orb's click-through overlay and do not enter notification history.
An optional, explicitly armed local wake listener is described in
[wake activation](WAKE-WORD.md). There is no recording store or autonomous local approval.
Speech uses the existing gateway ChatGPT OAuth route. Existing agent reasoning
fallbacks remain unchanged and can have their own costs.

The receive path uses GStreamer's standard 200 ms WebRTC jitter-buffer setting,
Opus loss concealment and in-band error correction when the sender provides it.
Latency messages trigger pipeline timing recalculation after the incoming track
appears. Offline media tests deliberately drop packets and verify generated
concealment samples, along with two-way audio, mute and device release. This
does not prove physical speaker quality or establish the cause of every dropout.

## Sources

- [GStreamer webrtcbin](https://gstreamer.freedesktop.org/documentation/webrtc/)
- [WebRTC audio processing and echo probe](https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcdsp.html)
- [OpenClaw realtime sessions](https://docs.openclaw.ai/nodes/talk/realtime-sessions)
- [OMA source and licence](https://github.com/wombatoperator/omarchy-voice)

## Package and setup boundary

Exactly one root manifest exposes `VoiceIndicator.qml` as a bar widget. Each bar
entry owns a `VoiceOrb` visual child on its own screen; that child retains the
boxed status, speech bubbles and optional legacy orb. Removing the bar entry
unloads these visuals. The companion has a separate lifecycle: stop voice before
disabling the UI. Disabling the UI cannot promise that a separately launched
audio worker is stopped. Re-enable only watches existing state.

`install.py` explicitly previews/applies companion file changes. It never runs
from QML, calls a package manager, modifies credentials or starts a service.
The user starts the configured companion separately. App/shortcut/bar invocation
can then start the service on demand and toggle voice, as before.

The SDP exchange shares a 25-second deadline across headers and body. Its reader
accumulates at most 131072 UTF-8 bytes and rejects the first overflow chunk before
copying or decoding it, even without Content-Length. Fetch may itself deliver a
larger transport chunk; this is an application buffer bound, not a whole-process
memory limit. Stop/failure/deadline cancels the reader and releases its lock.
