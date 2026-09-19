# Project instructions

Read CONTRIBUTING.md, SECURITY.md and CREDITS.md. This repository is private
during development; public release requires an explicit owner decision.
Maintain a clean, publication-ready history using synthetic fixtures and a
GitHub noreply author/committer identity. Preserve all upstream notices.

Never add private runtime data, account configuration, audio, screenshots,
transcripts or machine-specific endpoints to tracked files. Stage explicit
paths and run tests, whitespace and publication checks before committing or
pushing. Do not bypass the hooks. Live voice tests must be explicitly opted in;
automated tests use synthetic signals and fake output sinks; live provider
checks send synthetic silence only. Never open physical audio devices in tests.

Do not add API-key speech providers, change shared agent fallbacks, weaken
OpenClaw approval gates or edit packaged Omarchy files. Keep microphone capture
off until a user invokes voice, and release it on stop, errors and cancellation.
