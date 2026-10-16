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

For startup/state recovery, run `python3 test/qml_cold_start.py` in an Omarchy
graphical session. It uses synthetic idle state and a fake control; it never
starts a voice session or opens audio devices.
