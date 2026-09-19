# Credits and provenance

This project builds on **OMA / omarchy-voice**, created by
[wombatoperator and the omarchy-voice contributors](https://github.com/wombatoperator/omarchy-voice).
The native orb, its animation and the bar indicator come from that project.
They are reused under its MIT licence, not presented as an original design here.

Upstream source revision: `8ef9d6094cff87ad88903481de2b6b4e942c4e86`.

| This repository | Upstream source | Changes |
| --- | --- | --- |
| `plugin/openclaw-voice.orb/VoiceOrb.qml` | `plugin/voice.orb/VoiceOrb.qml` | Runtime namespace, stale-state heartbeat, top-right conversation bubbles, plain-text captions and duplex-audio comments |
| `plugin/openclaw-voice.indicator/VoiceIndicator.qml` | `plugin/voice.indicator/VoiceIndicator.qml` | Application naming, custom lobster/microphone icon, status dot, launcher command, stale-state handling; no click-to-confirm approval |
| Plugin manifests | Corresponding OMA plugin manifests | Names, IDs, author credit, descriptions and version |
| `tools/check_public_files.py` | Same path | Unchanged publication guard |
| `.githooks/pre-commit`, `.githooks/pre-push` | Same paths | Unchanged privacy hooks |

[LICENSE-OMA](LICENSE-OMA) preserves the complete upstream notice:
Copyright (c) 2026 omarchy-voice contributors. The notice is also distributed
with each derived plugin. Integration code and modifications are MIT-licensed,
Copyright (c) 2026 brokemac79.

`plugin/openclaw-voice.orb/TranscriptBubble.qml` adds a themed, click-through
conversation display for this integration. It uses the existing Omarchy theme
and accompanies the OMA-derived orb.

The custom bar icon, `plugin/openclaw-voice.indicator/openclaw-voice.svg`, adapts
OpenClaw's lobster favicon from `ui/public/favicon.svg` at revision
`692464e6f8e00e6416eeb050fa7916c129ea3ac4` of
[openclaw/openclaw](https://github.com/openclaw/openclaw). The adaptation uses a
flat colour, simpler eyes and a microphone inside the body for small bar sizes.
Copyright (c) 2026 OpenClaw Foundation; modifications Copyright (c) 2026
brokemac79. The complete upstream MIT notice is distributed with the icon in
[LICENSE-OPENCLAW](plugin/openclaw-voice.indicator/LICENSE-OPENCLAW).

[OpenClaw](https://github.com/openclaw/openclaw) provides the gateway, agent
consultation and voice session controls. GStreamer, its WebRTC audio-processing
plugins and PyGObject provide the native audio engine; PipeWire supplies desktop
audio through its PulseAudio compatibility interface. These dependencies are installed separately and retain
their own licences; this repository does not relicense or bundle them.

This is an independent integration, without an endorsement from OMA, OpenClaw,
Omarchy or OpenAI. It is maintained as a separate repository so development can
remain private until a deliberate public release.
