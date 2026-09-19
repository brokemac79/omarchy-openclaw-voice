# Contributing

Keep changes small and use synthetic fixtures. Do not commit desktop captures,
audio, transcripts, credentials, private endpoints or personal configuration.
The repository is private for now, but review every commit as a future public
artifact. Preserve upstream attribution and licence notices.

Use your GitHub noreply identity for author and committer. Enable the included
hooks with `git config core.hooksPath .githooks`. Stage explicit paths, inspect
the diff and run:

```sh
npm test
git diff --cached --check
python3 tools/check_public_files.py --staged
python3 tools/check_public_files.py --history HEAD
```

Offline tests must not use real microphones, speakers, accounts or providers.
Live integration checks require explicit opt-in and synthetic silence. Check
native QML changes on Omarchy using synthetic state; keep any captures private.
Before a public release, review repository history, dependency compatibility,
documentation and actual microphone/speaker behaviour. Do not bypass scanners.

For an explicitly authorized live smoke test, stop the installed service, run
`ANT_VOICE_TEST_SILENCE=1 node src/server.mjs`, then in another terminal run
`ANT_VOICE_LIVE_TEST=1 node test/live-smoke.mjs`. The test refuses a daemon that
has real microphone capture enabled. Stop the test daemon before restoring the
normal service. Never add the test environment flag to the installed service.
