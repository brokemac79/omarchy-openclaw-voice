# Local marketplace preparation evidence

25 September 2026. Private preparation only; no push, release, marketplace
submission or live desktop/Gateway mutation. Starting source was v0.3.4,
`57e55f89f972d08b45cc99f3b005cffb1ca1fcd8`. The final candidate identity is the
local commit containing this document; record its full SHA during handoff.

## Changed behavior

- Actions checkout/setup-node are pinned to verified upstream v4 commit objects:
  `11d5960a326750d5838078e36cf38b85af677262` and
  `49933ea5288caeca8642d1e84afbd3f7d6820020`. Verified via the upstream repositories'
  `git/ref/tags/v4` API responses, not copied from a third-party workflow.
- SDP response accumulation stops at 131072 bytes before decoding. Overflow,
  Stop, failure and the shared 25-second deadline cancel the reader; transport
  buffers are outside this application bound. No physical audio was exercised.
- One root manifest, `community.openclaw-voice`, replaces both nested manifests.
  Existing QML, selector, icon and MIT notices move into the package root. The
  bar entry owns the conversation/status child and shares its instance selector.
- Companion setup is explicit, previews by default, requires `--apply`, and
  leaves the unit stopped. Shortcut replacement requires its own opt-in.
  Receipt/hash/mode checks protect later edits during upgrade, removal and
  restoration. Plugin enable/disable never invokes setup or systemd.

## Executed checks

| Surface | Command/environment | Observed result |
| --- | --- | --- |
| Linux runtime regression | `npm test`, disposable `node:24-bookworm`, Node 24.20.0, network disabled, source mounted read-only | 53 passed, zero skipped |
| Companion file behavior | `python3 -m unittest discover -s test -p 'test_*.py'`, same container, Python 3.11.2 | 13 passed, zero skipped |
| SDP synthetic fixtures | Exact UTF-8 byte limit, one-byte/chunked/unending overflow, stalled input/deadline and Stop during exchange | Accepted exact limit, rejected overflow, cancelled/released readers, no answer after Stop |
| Installer fixtures | Real disposable home/XDG files; mocked systemd/audio dependency probes | Preview no mutation; install/upgrade/remove/restore; displaced bytes/modes restored; later edits and stop failure preserved |
| Official manifest validator | Pinned Omarchy `bin/omarchy-plugin-validate` under Debian Bash/jq | Exit 0; one root manifest, valid entrypoint, no plugin symlinks |
| Static marketplace analysis | Official analyzer at `6787464a38421722286b6a2cfbbfc5f9c6cc65b1`, local Git-index sources selected by its path policy | 22 source files; no unsafe-execution findings; `review-required`: installer, package-manager, service-management |
| Publication/whitespace | `python tools/check_public_files.py --staged`, `--history HEAD`, `git diff --cached --check` | Clean before commit; exact final history is checked again at handoff |
| Assets/notices | Visual inspection of both approved PNGs; root preview byte comparison; OMA/OpenClaw notice moves | Existing synthetic artwork unchanged, root preview equals conversation capture |

The local analyzer does not perform public-repository intake, remote GitHub
snapshot fetch, asset probes or a marketplace attestation. The repository is
private and must remain so until an owner decision. The local result is not
approval, security certification or a claim that the installer is sandboxed.
Raw validation inputs/results are retained locally under ignored
`docs/private/marketplace-prep/`, never included in publication. The final commit
is re-analyzed from Git blobs, with its exact identity recorded in that result.

## Remaining proof and decisions

There is no available isolated Omarchy graphical session, Quickshell runtime,
qmllint with the real shell imports, or user-systemd desktop in the local test
containers. Consequently the updated QML harness, actual plugin discovery,
multi-monitor rendering, disable/re-enable, shell restart, legacy migration and
real service-manager lifecycle remain unexecuted. The official manifest check
does not prove QML loads. See [the concrete test procedure](RELEASING.md).

Plugin disable/removal removes UI only. Stop voice and the separate companion
first; re-enable itself does not start capture. Companion removal must happen
before deleting its plugin checkout if using that checkout's installer.

Native generated-audio validation from v0.3.4 was not rerun here because these
containers lack its GStreamer stack. No changed native/audio.py code or new
physical-device claim is included. The earlier af640b6 human smoke and staged
b770a861 connection are separate from this package. Main speech is pending;
no released OpenClaw minimum or narrower agent-consult grant is established.

Owner/parent review must choose the release version and final compatibility
target, complete isolated desktop/human proof, and approve public visibility
and the [submission body](SUBMISSION-DRAFT.md). No maintainer was contacted.
