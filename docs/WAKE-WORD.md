# Optional local wake activation

Wake support defaults to disabled. Configuring it does not arm a microphone.
Click-to-talk uses the existing authenticated Talk route and does not select a
wake mode. Wake detection grants no permission, authentication or approval.

The first implementation provides explicit wake-to-conversation activation.
Talk remains open until Stop, failure or disconnect. Automatic return after one
request is deferred to [issue #6](https://github.com/brokemac79/omarchy-openclaw-voice/issues/6)
and remains disabled. Battery drain has not been qualified. These limits are
accepted for this implementation; they are not claims of completed qualification.

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
The selected phrase (when configured as text) and return mode stay visible in
the panel or tooltip.

## Detector boundary

The candidate supports **sherpa-onnx keyword spotting** and **openWakeWord with
ONNX on Linux**, selected explicitly. Both reuse the
native PulseAudio/PipeWire input path at 16 kHz mono S16LE. Its pipeline has no
WebRTC, playback, encoder, network or recording element. No PCM or captions go
to Node. The bounded stdout protocol accepts readiness, heartbeat and one wake.
The child receives local model/device settings and an environment allowlist,
without OpenClaw credentials. Models are explicit files, with no downloader or
fallback provider. The selected OpenClaw trigger accepts the documented word-boundary variants below.

The owner waits for detector exit before starting Talk. Pending detector startup
is cancellable. A failed release blocks replacement input. Stop, errors,
disconnect, standby mute and shutdown disarm input. Gateway reconnect, service
startup and QML reload never arm it. Late callbacks cannot restart an ended
session. No pre-activation buffer is transferred: say the phrase, wait for
Talk readiness, then speak the request.

The detector is absent during assistant playback. A fresh detector ignores its
first two seconds to reduce activation from residual playback. openWakeWord
requires three consecutive qualifying frames by default; sherpa-onnx supplies
its own completed keyword decision. A bounded activity counter
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
response now measures detection to native transport, microphone-frame and
provider readiness using a monotonic clock. Physical measurements from the
Surface trial below used the earlier transport/provider gate in candidate `a791e2d`.

The three ONNX assets came from upstream release `v0.5.1`, outside this checkout:

| Asset | SHA-256 |
| --- | --- |
| hey_jarvis_v0.1.onnx | `94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb` |
| melspectrogram.onnx | `ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f` |
| embedding_model.onnx | `70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f` |

No positive phrase samples were used. This qualifies the adapter/runtime on
generated signals only; it does not select “Hey Jarvis” as the product phrase
or establish redistribution rights for a custom “Hey OpenClaw” model.
After extracting the shared adapter, the same real-model/GStreamer checks also
passed with NumPy 2.5.4 and ONNX Runtime 1.31.0. openWakeWord imports require
scikit-learn even when its optional custom verifier is unused.

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

### Configurable phrase with sherpa-onnx

[sherpa-onnx open-vocabulary keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)
supports configuring phrases without training a separate classifier. This is
the preferred candidate for an opted-in room trial of “Hey Open Claw”. It is
still disabled by default and does not replace an installed detector.

The separately installed runtime is Apache-2.0. The official
[`sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` archive](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2)
has SHA-256 `f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a`.
Its README explicitly identifies the model licence as Apache License 2.0,
GigaSpeech XL as the training dataset, BPE tokens and the icefall training
recipe. No dataset, model or runtime is bundled or downloaded by this product.

The adapter accepts one English phrase of two to five words, tokenizes it
locally using the supplied SentencePiece model and checks every token against
the selected token set. Selecting either “Hey Open Claw” or “Hey OpenClaw”
compiles both BPE word-boundary paths as alternatives for the same wake event.
Both require “Hey”; this does not add unprefixed “OpenClaw” or lower the threshold.
Other configured phrases are unchanged. Human recognition of either pronunciation
still depends on the acoustic model and room conditions. The keyword library reads tokenized configuration from
an anonymous memory file, which is then closed. It does not receive audio files,
credentials or permission to use a network. Missing assets, incompatible tokens
and unsupported settings fail closed before opening input. There is no backend
or phrase fallback. The external model files used were:

| Asset | SHA-256 |
| --- | --- |
| encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx | `1e721676515bcd42a186979733981213c66c80db680e1cc582dfedf3be76e678` |
| decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx | `e40ff43297abe815e8898494c17e71bba2152d9d40fa3eb803f75d0f7533329a` |
| joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx | `eae9da0c7e1e6c6a3f4cc42d167899c388f6c6701b94cb96320e4f55df79624c` |
| tokens.txt | `fd2ded4050a55d2b1578870ba8697d02371980217806b7558bd0a5cc60f3ba53` |
| bpe.model | `c8a2a0129c4ab8e463164c142f82d25649661b122c8cd0b7aab5c9e80b90ad24` |

On an AWS x86-64 test VM, the production adapter loaded with Python 3.14.4,
sherpa-onnx/core 1.13.8, SentencePiece 0.2.2 and NumPy 2.5.4. It used one CPU
thread and the upstream keyword threshold 0.25, keyword score 1 and trailing
blank count 1. No threshold was tuned to fit the generated examples.

| Generated speech | Target triggers | Negative triggers |
| --- | --- | --- |
| eSpeak NG 1.52.0, two voices, three speeds | 0/6 | 0/30 |
| Piper 1.8.0, one LJSpeech voice, three length scales | 3/3 | 0/15 |

The Piper tests used length scales `175/130`, `1` and `175/220`; these are
generator settings, not measured speech rates. Negative controls included “Hey
Claude”, “Hello computer”, “Open the door”, “Hey open door” and “Open claw”.
Piper was an offline test generator only, using its Python API to produce PCM
in memory without speaker playback. Its runtime has GPL terms and the selected
[LJSpeech voice card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD)
identifies a public-domain source dataset. Neither is a product dependency or
bundled asset. The external generator model SHA-256 was
`5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a`.

The actual GStreamer worker also detected one generated neural phrase exactly
once and rejected another phrase, silence and a tone. Each case exited and
released its pipeline with no stderr diagnostics. Input came from a bounded
test-only `appsrc`; the production CLI cannot select that source. Model loading
took about 0.44 seconds including its imports; the probe's peak RSS before
loading the test generator was 149308 KiB. Separate worker processes peaked at
101904–102304 KiB, measured through their own `/proc/self/status` `VmHWM` to
exclude the parent generator's inherited resource high-water mark. The
generated appsrc audio ran faster than real time. These cloud timings do not measure physical
capture, end-to-end readiness, Surface resource cost or battery drain. The
mixed synthetic results, especially the eSpeak misses, do not establish human
accuracy or a false-wake rate.

To repeat the phrase probe and actual-worker checks with externally provisioned
models and optional test-generator dependencies:

```sh
python3 test/qualify_sherpa_phrase.py --model-directory /absolute/path/to/kws-model
python3 test/qualify_sherpa_phrase.py --model-directory /absolute/path/to/kws-model \
  --piper-model /absolute/path/to/en_US-ljspeech-high.onnx
python3 test/sherpa_native.py --model-directory /absolute/path/to/kws-model \
  --piper-model /absolute/path/to/en_US-ljspeech-high.onnx
```

### Opted-in Surface trial (16 October 2026)

The owner completed a single consolidated room trial on a Surface Pro 3 and
accepted the wake-to-conversation implementation. It used candidate `a791e2d`,
Python 3.14.7, Node.js 26.8.1, GStreamer 1.28.6 and the sherpa-onnx runtime,
model hashes and threshold documented above. The normal companion installation
was preserved and restored after the trial. Only aggregate results are included
here; no audio, captions, account configuration or private endpoints are published.

| Observation | Result |
| --- | --- |
| Near/far recognition before the word-boundary fix | 4/10 near; 7/10 far |
| Negative phrases | No unwanted activation reported |
| Room-noise standby | No unwanted activation reported during 648.2 seconds of observed standby (about 10.8 minutes) |
| Off, ordinary Talk/captions/mute, conversation/playback, standby mute, selected-input mute, Stop races and manual Talk from standby | Operator reported pass |
| Detection to transport and provider readiness | 13 samples; median 2453 ms, range 2147–2663 ms |
| Steady detector CPU | Mean 14.0% of one core |
| Detector RSS | 114412–115088 KiB (about 112 MiB) |
| Simultaneous detector and Talk workers | None observed at 0.5-second polling intervals |
| Observer overhead | Mean 0.62% of one core |
| Battery drain | Not measured; AC power remained connected |

The owner reported that recognition might depend on saying “Open Claw” versus
“OpenClaw”. The tokenizer produces distinct word-boundary paths for those
spellings; this does not prove that word boundaries caused the observed misses.
Commit `3884a41` accepts both paths for the same trigger without changing the
threshold. The actual model and GStreamer worker subsequently detected generated
“Hey Open Claw” and “Hey OpenClaw” exactly once each, and rejected an unrelated
phrase, silence and a tone. All five cases completed without stderr diagnostics.
The Linux regressions passed 73 Node tests and 23 Python tests with no skips.
The owner requested no repeat physical trial; the earlier recognition counts
remain unchanged and do not establish post-fix human accuracy.

This short room observation does not establish an hourly false-wake rate,
battery life or performance across speakers and rooms. The CPU and memory
numbers are measurements of this model on this device, not performance promises.

[Porcupine](https://picovoice.ai/docs/porcupine/) supports Linux x86-64/custom
phrases but requires an account AccessKey. It is not selected.

## Explicit operation

After qualifying the runtime and licensed model set, merge one explicit backend
into the private companion configuration. An isolated wake interpreter must
also be able to import the system PyGObject/GStreamer bindings. `wake.python`
selects that interpreter without changing the existing Talk interpreter.

For the configurable English phrase and the model above:

```json
{
  "wake": {
    "enabled": true,
    "backend": "sherpa-onnx",
    "python": "/absolute/path/to/wake-venv/bin/python",
    "phrase": "Hey Open Claw",
    "encoder": "/absolute/path/to/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
    "decoder": "/absolute/path/to/decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
    "joiner": "/absolute/path/to/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
    "tokens": "/absolute/path/to/tokens.txt",
    "bpe": "/absolute/path/to/bpe.model",
    "threshold": 0.25
  }
}
```

For a separately qualified openWakeWord classifier:

```json
{
  "wake": {
    "enabled": true,
    "backend": "openwakeword",
    "model": "/absolute/path/to/selected-phrase.onnx",
    "melspec": "/absolute/path/to/melspectrogram.onnx",
    "embedding": "/absolute/path/to/embedding_model.onnx",
    "threshold": 0.5,
    "consecutive": 3
  }
}
```

Asset paths must be absolute existing files with the indicated extensions.
Missing models/dependencies fail closed. `consecutive` applies only to
openWakeWord; sherpa-onnx rejects it. Omitting `backend` retains the original
openWakeWord adapter. Explicitly arm conversation standby for this running service:

```sh
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

The same limitation was rechecked against public revision
`9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa`. In its relocated
[Gateway-control owner](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/client-gateway-control.ts),
`runConsult` awaits host work and submits the result independently of
`onResponseDone`. Its [session harness](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/talk/realtime-session-harness.ts)
still ends the turn on the provider-response outcome. A companion cannot
qualify single-request completion using this response event alone. Keep that
mode disabled pending a correlated completion contract; human wake accuracy
testing cannot resolve this missing API boundary.

`standby-conversation` leaves Talk open until Stop, failure or disconnect. It
does not return automatically. Stop always means Off, including one-request
mode. To change modes, Stop and arm again. Standby mute also means Off.
Click-to-talk from Standby releases the detector and starts ordinary Talk with
no return mode. The synthetic-silence test daemon refuses standby commands.

## Validation and room trials

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

For a new runtime/model combination, qualify versions, hashes, licences,
missing-model failure and generated-signal inference on Linux x86-64. Then use
an explicitly opted-in room trial in a separate candidate instance, preserving
the installed release until that trial is authorized:

1. Verify Off owns no input and boot/reconnect stays Off. Arm conversation standby, check
   local-only input and confirm Stop releases it.
2. Measure wake-to-ready latency with monotonic numeric counters, without
   recordings or real captions. Speak only after readiness. Check ordinary
   approval rules still apply.
3. Try 20 wakes near/far, then representative TV/room noise and
   assistant playback. Include hardware mute, repeated phrases and Stop races.
   Record the actual observation duration; an hour gives broader coverage than
   the short trial above.
4. Once an authoritative completion boundary is available, qualify one-request
   behavior with short/long replies, pauses and host actions.
   It must not treat an acknowledgment as a finished action or truncate the
   requested answer. Disable it if provider events cannot distinguish that boundary.
5. Measure standby CPU/RSS and battery drain against Off on the actual Surface.
   Record phrase, threshold, versions and results. Cloud/synthetic timings do
   not establish room accuracy or Surface battery cost.

Publication, installation, service restarts and physical audio are separate
owner decisions. Synthetic checks alone do not qualify a release. Keep private
manual-trial results separate from public fixtures and distinguish observed
room behavior from general accuracy or battery-life claims.
