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
  Its MIT code and attribution remain in the distributed plugins.
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
There is no wake-word listener, recording store or autonomous local approval.
Speech uses the existing gateway ChatGPT OAuth route. Existing agent reasoning
fallbacks remain unchanged and can have their own costs.

## Sources

- [GStreamer webrtcbin](https://gstreamer.freedesktop.org/documentation/webrtc/)
- [WebRTC audio processing and echo probe](https://gstreamer.freedesktop.org/documentation/webrtcdsp/webrtcdsp.html)
- [OpenClaw realtime sessions](https://docs.openclaw.ai/nodes/talk/realtime-sessions)
- [OMA source and licence](https://github.com/wombatoperator/omarchy-voice)
