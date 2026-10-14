<!-- DRAFT ONLY. Private repository. Resolve fields and owner checklist before submission. Title: [Plugin]: OpenClaw Voice -->

### Repository URL

https://github.com/brokemac79/omarchy-openclaw-voice

### Category

Widgets

### Tags

ai, bar, quickshell

### Suggest a missing tag

_No response_

### Maintainer notes

One root plugin, `community.openclaw-voice`, with a microphone bar control,
boxed status and speech bubbles. It owns its visual children and has no nested
manifests. Independent MIT integration derived from OMA, retaining OMA/OpenClaw
notices. The preview reuses an owner-approved synthetic v0.3.4 widget capture.

Release: [v0.4.0 preview](https://github.com/brokemac79/omarchy-openclaw-voice/releases/tag/v0.4.0).
Resolve that tag to its exact commit for the marketplace snapshot; do not use a
moving main head. The exact v0.4.0 package completed an owner-authorized upgrade
on an existing Omarchy `4.0.4-1` / Quickshell `0.3.1` desktop on 14 October 2026.
Native manifest validation, synthetic QML/native-audio checks and a manual
voice/bubble trial passed against OpenClaw main
`9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa`. Only the consolidated voice plugin
remains registered; the old two-plugin layout is backed up and retired.
The exact release archive also passed isolated fresh companion installation,
real user-systemd start/stop, upgrade, removal, backup restoration and later-edit
refusal. That Linux VM used real GStreamer checks and a synthetic local Gateway
SDK, without physical audio devices or real provider/agent requests. A fresh
Omarchy OS and the complete graphical lifecycle remain unverified. Released
OpenClaw minimum: NOT ESTABLISHED. See docs/COMPATIBILITY.md for identities and limits.

Manual setup classification requested. Plugin add/enable loads the UI in the
unsandboxed user shell. It does not run an installer, install dependencies,
enroll credentials, start services or open audio. In the reviewed checkout,
`python3 install.py` previews files; `python3 install.py --apply` installs the
companion and leaves it stopped. Node 22+, Python/PyGObject, GStreamer/libnice,
PipeWire, user systemd and a compatible configured OpenClaw are required.
Dependencies are installed explicitly by the user.

Setup writes user source/launcher/unit files, backs them up and manages systemd
units. README includes a manual package-manager command. Review these installer,
source-install and service-management capabilities. Super+Shift+V replacement
requires `--replace-shortcut`; existing/local-edited companion files require
`--replace-existing`. Removal uses `--remove` before plugin removal; recovery
checks expected hashes/modes. Plugin disable/removal hides UI only: stop voice
and the companion first. OpenClaw credentials and approval policy are untouched.

Explicit service start connects through existing device authentication.
Requested operator.admin/read/write/approvals scopes remain broad and unchanged.
The direct-RPC scope audit is separate from unproven least-privilege agent-consult
requirements. Speech uses online GPT-Live with existing ChatGPT OAuth; no API-key
speech provider or new fallback is added. Existing reasoning fallbacks can incur
their own provider charges.

Capture starts only on voice invocation. Stop/failure/cancellation release audio;
reconnect does not reopen it. Captions are private runtime state; the app does
not save audio/transcript history. Gateway/provider retention is separate. Mute
sends silence while keeping the device open; Stop releases it. Streamed SDP is
bounded to 131072 accumulated bytes with a shared 25-second exchange deadline.

Local checks and gaps are in docs/COMPATIBILITY.md and docs/MARKETPLACE-PREP.md.
BEFORE SUBMISSION: complete the remaining graphical disable/re-enable,
restart/failure and plugin-removal matrix. Preserve the exact
v0.4.0 isolated companion lifecycle, desktop upgrade, QML and human-trial scope;
later code needs affected proof. The older offline installer fixtures mock
desktop commands; the new isolated service-manager checks do not.
Obtain a fresh published exact-snapshot baseline and disclose its capabilities.

### Submission checklist

- [ ] The repository is public and contains installation and removal instructions.
- [ ] I have documented the plugin license and any external dependencies.
- [ ] I confirm that I own or have permission to submit this plugin and its preview assets.
- [ ] The plugin does not overwrite user configuration without explicit consent.
- [ ] I understand that approval is for listing and is not a security review.
