# Credits and provenance

This project builds on **OMA / omarchy-voice**, created by
[wombatoperator and the omarchy-voice contributors](https://github.com/wombatoperator/omarchy-voice).
The native orb, its animation and the bar indicator come from that project.
They are reused under its MIT licence, not presented as an original design here.

Upstream source revision: `8ef9d6094cff87ad88903481de2b6b4e942c4e86`.

| This repository | Upstream source | Changes |
| --- | --- | --- |
| `VoiceOrb.qml` | `plugin/voice.orb/VoiceOrb.qml` | Runtime namespace, stale-state heartbeat, top-right status and conversation bubbles, plain-text captions, independently optional orb and duplex-audio comments |
| `VoiceIndicator.qml` | `plugin/voice.indicator/VoiceIndicator.qml` | Application naming, custom lobster/microphone icon, status dot, launcher command, stale-state handling and separate right-click voice controls; no click-to-confirm approval |
| Root `manifest.json` | Corresponding OMA plugin manifests | One bar package owning the conversation UI; names, ID, author credit and settings |
| `tools/check_public_files.py` | Same path | Unchanged publication guard |
| `.githooks/pre-commit`, `.githooks/pre-push` | Same paths | Unchanged privacy hooks |

[LICENSE-OMA](LICENSE-OMA) preserves the complete upstream notice:
Copyright (c) 2026 omarchy-voice contributors. The notice is distributed at the plugin root. Integration code and modifications are MIT-licensed,
Copyright (c) 2026 brokemac79.

`TranscriptBubble.qml` adds a themed, click-through
conversation display for this integration. It uses the existing Omarchy theme
and remains visible independently of the optional OMA-derived orb.
`VoiceControls.qml` adds a deliberately opened panel for independent input mute,
speech Quiet and End voice. It uses the Omarchy theme and keeps unsupported
request cancellation visibly unavailable.

The custom bar icon, `openclaw-voice.svg`, adapts
OpenClaw's lobster favicon from `ui/public/favicon.svg` at revision
`692464e6f8e00e6416eeb050fa7916c129ea3ac4` of
[openclaw/openclaw](https://github.com/openclaw/openclaw). The adaptation uses a
flat colour, simpler eyes and a microphone inside the body for small bar sizes.
Copyright (c) 2026 OpenClaw Foundation; modifications Copyright (c) 2026
brokemac79. The complete upstream MIT notice is distributed with the icon in
[LICENSE-OPENCLAW](LICENSE-OPENCLAW).

[OpenClaw](https://github.com/openclaw/openclaw) provides the gateway, agent
consultation and voice session controls. GStreamer, its WebRTC audio-processing
plugins and PyGObject provide the native audio engine; PipeWire supplies desktop
audio through its PulseAudio compatibility interface. These dependencies are installed separately and retain
their own licences; this repository does not relicense or bundle them.

This is an independent integration, without an endorsement from OMA, OpenClaw,
Omarchy or OpenAI. It is maintained as a separate repository so development can
remain private until a deliberate public release.

The optional wake adapter calls separately installed
[openWakeWord](https://github.com/dscripka/openWakeWord) by David Scripka and
contributors (Apache-2.0) through its public Python API. No upstream code or
models are bundled. Included upstream pretrained models have separate
CC BY-NC-SA 4.0 terms; see [the model assessment](docs/WAKE-WORD.md).

The configurable English wake adapter calls
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) by the k2-fsa/sherpa-onnx
contributors and [SentencePiece](https://github.com/google/sentencepiece) by
Google and contributors through their public Python APIs (both Apache-2.0).
The externally provisioned GigaSpeech keyword model identifies its own
Apache-2.0 licence and training provenance. No upstream code, runtime, model or
dataset is bundled. Optional synthetic qualification uses eSpeak NG or
[Piper](https://github.com/OHF-Voice/piper1-gpl) (GPL) and an external LJSpeech
voice; these are test generators, not product speech providers. See the model
assessment for exact artifacts, hashes, licence distinctions and proof limits.
