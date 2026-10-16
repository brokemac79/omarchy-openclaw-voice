# Optional local wake activation (development candidate)

Wake support defaults to disabled. Configuring it does not arm a microphone.
Click-to-talk uses the existing authenticated Talk route and does not select a
wake mode. Wake detection grants no permission, authentication or approval.

| State | Input ownership | Where audio goes |
| --- | --- | --- |
| Off | None | Nowhere; cannot hear a phrase |
| Standby | Local detector only | Bounded memory frames; no recordings or uplink |
| Connecting | Detector released before Talk starts | Fresh Talk input only; wait for readiness before speaking |
| Talk | Existing native WebRTC worker | Existing Gateway-controlled Talk route |
| Stopping | Cleanup in progress | Wait for release confirmation |
| Unknown | No trustworthy UI heartbeat | Use Stop; stale UI does not prove input is released |

The indicator uses a blue dot for Standby, amber for Connecting and green for
Talk. Its tooltip names the state. Standby and Connecting also have a compact
status panel; the existing conversation bubbles remain available in Talk.
The selected return mode stays visible in the panel or tooltip.

## Detector boundary

The candidate adapter uses **openWakeWord with ONNX on Linux**. It reuses the
native PulseAudio/PipeWire input path at 16 kHz mono S16LE. Its pipeline has no
WebRTC, playback, encoder, network or recording element. No PCM or captions go
to Node. The bounded stdout protocol accepts readiness, heartbeat and one wake.
The child receives local model/device settings and an environment allowlist,
without OpenClaw credentials. Models are explicit files, with no downloader,
phrase substitution or fallback provider.

The owner waits for detector exit before starting Talk. Pending detector startup
is cancellable. A failed release blocks replacement input. Stop, errors,
disconnect, standby mute and shutdown disarm input. Gateway reconnect, service
startup and QML reload never arm it. Late callbacks cannot restart an ended
session. No pre-activation buffer is transferred: say the phrase, wait for
Talk readiness, then speak the request.

The detector is absent during assistant playback. A fresh detector ignores its
first two seconds to reduce activation from residual playback. A wake requires
three consecutive qualifying frames by default. A bounded activity counter
allows classifier predictions to finish within 960 ms of preceding speech;
it retains no PCM. Input that has remained silent since arming cannot activate
it, including a hardware-muted microphone that supplies silence. A prediction
from speech already heard before hardware mute can still finish within that
window. Explicit standby mute disarms and discards pending detections.
Hardware mute that does not silence this selected input cannot be detected by this software.
These controls do not establish room accuracy or protection from TV speech.

## Licence and model assessment (2026-10-16)

[openWakeWord](https://github.com/dscripka/openWakeWord) code is Apache-2.0.
Its included pretrained models are CC BY-NC-SA 4.0, distinct from this project's
MIT licence. The documented phrases include “hey jarvis” and “hey mycroft”;
“Hey OpenClaw” is not supplied. A custom classifier requires training data and
distribution rights review. Embedding and mel-spectrogram assets also need
provenance review. No runtime, models or training corpus are bundled here.

The ONNX CPU path targets x86-64 Linux. Python, NumPy, PyGObject/GStreamer,
openWakeWord and ONNX Runtime must be qualified together. Upstream main and the published 0.6.0
package have differing dependencies; current Arch Python may lack compatible
wheels. Use an explicit compatible interpreter without modifying system Python.

### Generated-signal qualification

On an isolated x86-64 Linux VM, Python 3.14.4, openWakeWord 0.6.0, NumPy 2.3.5
and ONNX Runtime 1.31.0 loaded the external upstream `hey_jarvis_v0.1` model and
ran both direct inference and the actual GStreamer worker with generated input.
The runtime produced no stderr diagnostics. The distro's ONNX Runtime 1.23.2
package had duplicate schema-registration diagnostics and is not the qualified
combination. The virtual environment used system PyGObject and numerical
dependencies, with the ONNX wheel and openWakeWord installed separately;
openWakeWord's unused TFLite dependency was not installed.

| Measurement | Result on the test VM |
| --- | --- |
| Model initialization, after Python imports | 0.076 seconds |
| 20 seconds generated silence | 0.453 CPU seconds; maximum score 0.000157 |
| 20 seconds generated 440 Hz tone | 0.470 CPU seconds; maximum score 0.000232 |
| Peak RSS through inference | 228276 KiB |

These are generated-signal runtime checks, not measured standby battery cost,
wake-to-ready latency or wake accuracy. `wakeToReadyMs` in the private status
response measures detection to both transport and provider readiness using a
monotonic clock; no real wake-to-ready measurement has been made.

The three ONNX assets came from upstream release `v0.5.1`, outside this checkout:

| Asset | SHA-256 |
| --- | --- |
| hey_jarvis_v0.1.onnx | `94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb` |
| melspectrogram.onnx | `ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f` |
| embedding_model.onnx | `70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f` |

No positive phrase samples were used. This qualifies the adapter/runtime on
generated signals only; it does not select “Hey Jarvis” as the product phrase
or establish redistribution rights for a custom “Hey OpenClaw” model.

### Third-party “Hey OpenClaw” probe

A third-party classifier exists in
[davidgarthe/hey-open](https://github.com/davidgarthe/hey-open/tree/ddc9b4802614c8aa84d288ab25cff390d7f430f5/assets/oww)
at revision `ddc9b4802614c8aa84d288ab25cff390d7f430f5`. The project has an
Apache-2.0 licence, but its model README documents only filenames and format,
without training-data provenance or model evaluation. This model has not been
selected for distribution. Neither that application's code nor its models have
been copied into this product.

The external `openclaw.onnx` SHA-256 was
`683777f6a0d11974b004e9d609a5f8550afecf2793d19d807eee738c1c273a02`.
`test/qualify_wake_phrase.py` exercised it using eSpeak NG 1.52.0 speech emitted
to stdout, never a speaker or recording file. It used two generated voices
(`en-gb`, `en-us`), three speeds (130, 175, 220 words/minute), six target inputs
and eighteen negative controls. Python/openWakeWord/ONNX/NumPy versions matched
the generated-signal combination above.

This found an adapter defect: requiring audibility in every qualifying frame
rejected delayed predictions after the final phoneme. The bounded activity
counter and deterministic regression checks fix that temporal mismatch without
changing the score threshold or allowing silence since arming to wake input.
With threshold 0.5 and three consecutive scores, the fixed gate triggered on
2/6 target inputs and 0/18 negative controls. These small generated examples
establish neither human wake accuracy nor a false-wake rate. Four generated
misses and the provenance gap leave this classifier unqualified for selection;
the threshold was not lowered to fit these examples.

To reproduce the probe, use an interpreter with the wake dependencies and
`espeak-ng` installed, then run:

```sh
python3 test/qualify_wake_phrase.py --model /absolute/path/to/openclaw.onnx \
  --melspec /absolute/path/to/melspectrogram.onnx \
  --embedding /absolute/path/to/embedding_model.onnx
```

[sherpa-onnx open-vocabulary keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)
is another candidate: it supports configuring phrases without retraining a
classifier. Its particular model licences, resource cost and generated-phrase
behavior have not been qualified here. No second detector backend is selected.

[Porcupine](https://picovoice.ai/docs/porcupine/) supports Linux x86-64/custom
phrases but requires an account AccessKey. It is not selected.

## Explicit operation

After qualifying the runtime and licensed model set, merge into the private
companion configuration:

```json
{
  "wake": {
    "enabled": true,
    "model": "/absolute/path/to/selected-phrase.onnx",
    "melspec": "/absolute/path/to/melspectrogram.onnx",
    "embedding": "/absolute/path/to/embedding_model.onnx",
    "threshold": 0.5,
    "consecutive": 3
  }
}
```

Paths must be absolute existing ONNX files. Missing models/dependencies fail
closed. Select a mode explicitly for this running service:

```sh
openclaw-voice standby-once
openclaw-voice standby-conversation
openclaw-voice stop
```

The **synthetic one-request contract** rearms after a terminal event, input-mute acknowledgment
and 1.5 seconds of quiet native output, releasing Talk first. A missing terminal
event leaves Talk active and visible. Failure to confirm mute/quiet after a
terminal event ends voice after 30 seconds. The provider event and playback-tail
contract require live qualification: a provider response is not necessarily a
completed host action. Accepted work can outlive a call. This mode cannot be
used as proof of tool completion. The production owner therefore refuses
`standby-once` before opening input: the current native Talk route reports
provider responses, including acknowledgments, without establishing a finished
host request. The command and return lifecycle are reserved for qualification;
there is no configuration switch to bypass this guard. A safe completion
boundary remains required before enabling this mode.

The follow-up source audit used the existing public OpenClaw snapshot
`fc5e53d086a72c50f347b1d6c1fbd0132499ffed`, without updating a Gateway or fetching
main. In [the Gateway-control owner](https://github.com/openclaw/openclaw/blob/fc5e53d086a72c50f347b1d6c1fbd0132499ffed/src/gateway/talk-client-gateway-control.ts),
consultation results are submitted to the provider independently of the provider
response callback. The [session harness](https://github.com/openclaw/openclaw/blob/fc5e53d086a72c50f347b1d6c1fbd0132499ffed/src/talk/realtime-session-harness.ts)
ends a Talk turn on that response callback. Therefore a provider response ending
cannot by itself establish that the host request has completed. This is a
snapshot-level source finding, not new installed-version or live-provider proof.
Do not infer completion from caption text or another call's agent events.

`standby-conversation` leaves Talk open until Stop, failure or disconnect. It
does not return automatically. Stop always means Off, including one-request
mode. To change modes, Stop and arm again. Standby mute also means Off.
Click-to-talk from Standby releases the detector and starts ordinary Talk with
no return mode. The synthetic-silence test daemon refuses standby commands.

## Validation and trial gate

Automated tests use fake detectors, generated signals and fake sinks:

```sh
npm test
python3 -m unittest discover -s test -p 'test_*.py'
python3 test/native_wake.py
python3 test/native_audio.py
python3 test/qml_instances.py
python3 test/qml_cold_start.py
python3 test/qml_wake_states.py
```

Native wake tests exercise actual GStreamer framing with a fake predictor;
they do not prove trained-model accuracy. QML checks need an actual renderer
and synthetic state. Shell/theme stubs are narrower proof than installed Omarchy.
The candidate passed the actual Omarchy renderer wake-state/instance fixtures
and all five cold-start cases using synthetic state and fake controls. No
installed plugin/service was changed and no physical audio was opened.

Before release/deployment, qualify runtime/model versions, hashes, licences,
missing-model failure and generated-signal inference on Linux x86-64. Then use
an explicitly opted-in room trial in a separate candidate instance, preserving
the installed release until that trial is authorized:

1. Verify Off owns no input and boot/reconnect stays Off. Arm each mode, check
   local-only input and confirm Stop releases it.
2. Measure wake-to-ready latency with monotonic numeric counters, without
   recordings or real captions. Speak only after readiness. Check ordinary
   approval rules still apply.
3. Try 20 wakes near/far, then an hour of representative TV/room noise and
   assistant playback. Include hardware mute, repeated phrases and Stop races.
4. Check one-request behavior with short/long replies, pauses and host actions.
   It must not treat an acknowledgment as a finished action or truncate the
   requested answer. Disable it if provider events cannot distinguish that boundary.
5. Measure standby CPU/RSS and battery drain against Off on the actual Surface.
   Record phrase, threshold, versions and results. Cloud/synthetic timings do
   not establish room accuracy or Surface battery cost.

Publication, installation, service restarts and physical audio are separate
owner decisions. This candidate is source and synthetic validation work only.
