# Contributing

Keep changes small and use synthetic fixtures. Do not commit private desktop
captures, audio, real transcripts, credentials, private endpoints or personal configuration.
The repository is private for now, but review every commit as a future public
artifact. Preserve upstream attribution and licence notices.

Use your GitHub noreply identity for author and committer. Enable the included
hooks with `git config core.hooksPath .githooks`. Stage explicit paths, inspect
the diff and run:

```sh
npm test
python3 -m unittest discover -s test -p 'test_*.py'
git diff --cached --check
python3 tools/check_public_files.py --staged
python3 tools/check_public_files.py --history HEAD
```

Offline tests must not use real microphones, speakers, accounts or providers.
Live integration checks require explicit opt-in and synthetic silence. Check
native QML changes on Omarchy using synthetic state. Documentation screenshots
need owner approval, synthetic captions and visual review for private content.
Keep all other captures private.
Before a public release, review repository history, dependency compatibility,
documentation and actual microphone/speaker behaviour. Do not bypass scanners.

For an explicitly authorized live smoke test, stop the installed service, run
`OPENCLAW_VOICE_TEST_SILENCE=1 node src/server.mjs`, then in another terminal run
`OPENCLAW_VOICE_LIVE_TEST=1 node test/live-smoke.mjs`. The test refuses a daemon that
has real microphone capture enabled. Stop the test daemon before restoring the
normal service. Never add the test environment flag to the installed service.

On Linux with the audio dependencies installed, also run
`python3 test/native_audio.py`. This offline check uses generated audio and fake
sinks; it must never open physical input/output devices. Windows skips Unix
socket and symlink cases, so Linux validation is required before release.
Run `python3 test/native_worker_lifecycle.py` as well to check actual worker
shutdown with stdin left open, startup cancellation and malformed or oversized
commands. It uses synthetic silence and fake playback only.

For startup/state recovery, run `python3 test/qml_cold_start.py` in an Omarchy
graphical session. It uses synthetic idle state and a fake control; it never
starts a voice session or opens audio devices.

For optional wake activation, also run `python3 test/native_wake.py` on Linux
with the audio dependencies. It uses generated input and a fake predictor.
Run `python3 test/qml_wake_states.py` in the Omarchy graphical session for
Off/Standby/Connecting/Talk/Stopping/Unknown presentation checks with fake
controls. Runtime/model qualification is separate; see
[wake activation](docs/WAKE-WORD.md).

For interruption controls, the native audio proof also checks actual generated
playback samples through Quiet/resume and independent input mute. Run
`python3 test/qml_controls.py` in the Omarchy graphical session with synthetic
state and a fake launcher. It opens no physical audio device or live provider;
see [the contract limits](docs/INTERRUPTIONS.md).

Startup regressions in `test/readiness.test.mjs` cover actual milestone ordering,
sanitized failures and metric limits. The native audio proof checks first-frame
capture readiness; the Omarchy wake/state fixture also checks Preparing voice
and Ready/Input muted presentation. Keep diagnostic fixtures synthetic.

For action observations, run `python3 test/qml_action_cards.py` in the Omarchy
graphical session. It uses synthetic Talk events, the real owner/state writer
and actual QML components. Keep response events separate from execution evidence;
see [the missing result contract](docs/ACTION-PROGRESS.md).

For destination routing, also run `python3 test/qml_destinations.py` in Omarchy.
Use synthetic discovery, fake SDK/media and private disposable selection files.
Check active-call/review guards and old-call event isolation before claiming
switching coverage; see [destination contracts](docs/DESTINATIONS.md).

Run `python3 test/qml_bar_layout.py` for the default icon, optional agent label,
constrained/vertical slots and bounded multiline hover, using synthetic neighbours
and the real Omarchy components without audio.

For the answer reader, run `python3 test/qml_answers.py` in Omarchy with
`wl-copy`, `wl-paste`, `wtype` and QtTest available. It uses synthetic owner
events, actual components, pointer/simulated touch and keyboard/clipboard checks.
Clipboard data is restored from memory, never saved or logged. No microphone,
provider, external URL or real control is invoked; see [answer limits](docs/ANSWERS.md).

For audio setup, also run `python3 test/native_audio_check.py` with GStreamer
installed and `python3 test/qml_audio_devices.py` in Omarchy. Use generated tones,
fake sinks, synthetic inventories and fake controls only. The new test tone has
no microphone path. Verify binding/ownership, stale discovery, persisted choices,
Stop/Close and startup cancellation; see [audio limits](docs/AUDIO-DEVICES.md).
Run `python3 test/native_tone_lifecycle.py` for callback release and repeated
completion, SIGTERM with stdin open and EOF process exits. It uses generated
tones and fake sinks only; it never records or plays physical audio.

For hold-to-talk, run `python3 test/native_hold.py` on Linux and
`python3 test/qml_hold.py` in Omarchy. Use generated input, fake sinks, fake SDKs
and fake controls; never test a real microphone or provider automatically.
Check release-before-ready, native expiry, continuing replies, both release
settings and keyboard/touch cancellation; see [hold limits](docs/HOLD-TO-TALK.md).
