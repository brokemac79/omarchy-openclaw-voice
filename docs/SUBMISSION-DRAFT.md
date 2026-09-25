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

Candidate commit: TO FILL AFTER FINAL OWNER REVIEW. Release version: TO DECIDE
(preparation retains 0.3.4; no new release/tag). Tested Omarchy/Quickshell:
PENDING ISOLATED DESKTOP CHECK. Released OpenClaw minimum: NOT ESTABLISHED.
Earlier bounded human smoke used af640b6; matching b770a861 Gateway/node/SDK is
staged separately with no spoken outcome yet.

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

Local checks and gaps are in docs/MARKETPLACE-PREP.md. BEFORE SUBMISSION: complete
real isolated install, legacy upgrade, disable/re-enable, restart/failure,
removal/restoration, QML and opted-in human voice proof at the final commit.
Offline installer fixtures mock desktop commands and are not lifecycle proof.
Obtain a fresh published exact-snapshot baseline and disclose its capabilities.

### Submission checklist

- [ ] The repository is public and contains installation and removal instructions.
- [ ] I have documented the plugin license and any external dependencies.
- [ ] I confirm that I own or have permission to submit this plugin and its preview assets.
- [ ] The plugin does not overwrite user configuration without explicit consent.
- [ ] I understand that approval is for listing and is not a security review.
