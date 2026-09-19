# Omarchy OpenClaw Voice

Talk to your OpenClaw agent through **OMA's native Omarchy orb and bar icon**.
Press **Super+Shift+V** or click the **OpenClaw lobster-and-microphone icon** to
start; repeat to stop. A green dot marks an active call; amber marks an error.
The orb appears at the bottom of the screen, follows your Omarchy theme and
responds to incoming and outgoing audio. It does not take keyboard focus or
block clicks on your work.

The interface is adapted from **[OMA by wombatoperator and contributors](https://github.com/wombatoperator/omarchy-voice)**,
with its original MIT notice preserved. See [CREDITS.md](CREDITS.md) for the exact
source revision and changed files. This is early, independent software. The
repository is private during development; making it public is a separate decision.

## How it works

The native Quickshell plugins display state from a small local service. During
an explicit call, a native **GStreamer** worker handles microphone capture,
echo cancellation, speaker audio and WebRTC through Omarchy's PipeWire audio
server. The launcher uses a private Unix socket. No browser or local HTTP server
is required. See [the architecture decision](docs/ARCHITECTURE.md).

The bridge connects to your existing remote OpenClaw gateway. It requests
`gpt-live-1-codex` with `brain: agent-consult` so your selected agent supplies
tools, memory and reasoning through OpenClaw. Voice controls and approvals
remain owned by the gateway. Clicking the icon never approves a pending action.
The app has no fixed agent name. Set `sessionKey` in your private configuration
to select your own OpenClaw agent and conversation.

Speech uses the gateway's existing **ChatGPT OAuth** setup. No API key or paid
speech fallback is added. Before each call, the bridge checks the gateway's
visible configuration for an OAuth profile and rejects configured OpenAI API
keys. It cannot inspect hidden server environment variables or guarantee a
future gateway configuration. Keep the gateway's speech provider OAuth-only.
Existing agent reasoning fallbacks are preserved; a fallback can still incur
its own provider's charges even though speech uses OAuth.

The gateway's native PCM relay was evaluated but failed during startup on the
initial deployment. This version uses the working gateway-controlled WebRTC
path. It does not patch the gateway or replace its authentication.

## Requirements

- Omarchy with its Lua Hyprland configuration and Quickshell plugin system.
- Node.js 22+, Python 3 with PyGObject, GStreamer, and a user systemd session.
- GStreamer base/good/bad plugins and libnice, including `webrtcbin`,
  `webrtcdsp`, Opus and PulseAudio elements. `native/audio.py --check` checks them.
- An OpenClaw installation exposing `dist/plugin-sdk/gateway-runtime.js`, plus
  its runtime dependencies. Initial integration used OpenClaw client 2026.9.4 and
  gateway 2026.9.5; the Talk APIs can change between releases.
- A reachable remote gateway configured in `~/.openclaw/openclaw.json`, a paired
  device with the needed operator scopes, and working GPT-Live ChatGPT OAuth.

Existing OpenClaw credentials remain in OpenClaw's own private store. Do not
copy gateway tokens, OAuth credentials or personal configuration into this repo.

## Install

Read the source and run from your graphical session:

```sh
git config core.hooksPath .githooks
# If needed, install audio dependencies through Omarchy:
omarchy pkg add python-gobject gst-plugins-base gst-plugins-good gst-plugins-bad libnice
python3 install.py
# If Node is outside PATH: python3 install.py --node /path/to/node
openclaw-voice preflight
```

The installer backs up overwritten user files under
`~/.local/state/openclaw-voice/backups/`, installs the two native plugins and adds
the shortcut. **Super+Shift+V is replaced**; review any existing binding first.
Symlink destinations are rejected before any installation changes; resolve them
to ordinary user files first. XDG directories outside the home directory are
supported, and the backup manifest records original paths and modes. Packaged
Omarchy files are never edited. The bridge starts idle; no microphone
is opened by installation and the service is not enabled at login.

Default dependency locations match an OpenClaw Node installation under
`~/.local/share/openclaw-node/node_modules/`. To override them, create
`~/.config/openclaw-voice/config.json` with mode `0600`:

```json
{
  "gatewaySdk": "/path/to/openclaw/dist/plugin-sdk/gateway-runtime.js",
  "python": "/usr/bin/python3",
  "sessionKey": "agent:main:main",
  "voice": "cove"
}
```

`openclawConfig`, `inputDevice` and `outputDevice` are optional. The latter two
are stable PulseAudio device names from `pactl list short sources` and
`pactl list short sinks`. The defaults use the system microphone and speakers.
If upgrading, replace any old browser device IDs with these native names. This integration
does not discover or control Sonos or Spotify devices.

## Controls and limits

| Control | Action |
| --- | --- |
| Super+Shift+V / bar icon / app launcher | Start or end the conversation |
| `openclaw-voice stop` | End voice and release microphone/playback |
| `openclaw-voice mute` | Toggle microphone transmission during a call |
| `openclaw-voice status` | Show local connection and microphone state |
| `openclaw-voice preflight` | Check visible gateway authentication and voice readiness |

Microphone mute sends silence while keeping the input device open; Stop releases the device and closes
the audio engine. A network or engine failure stops the conversation. Reconnection
does not reopen the microphone. WebRTC supports speaking over a reply; physical
microphone, speaker and echo behaviour still require a test on each device.
There is no wake-word listener in this version.

The latest short caption and two audio levels are stored with private permissions
under `$XDG_RUNTIME_DIR/openclaw-voice/`. The bridge does not save audio or transcript
history. OpenClaw and the voice provider have their own session storage.

For problems, first run `openclaw-voice status`, then check the user service status
and gateway Talk diagnostics privately. Do not post raw diagnostics containing
tokens, transcripts or private hostnames.

To disable: run `openclaw-voice stop`, stop `openclaw-voice.service`, disable `openclaw-voice.orb` and
`openclaw-voice.indicator` with `omarchy plugin disable`, and remove the OpenClaw Voice `require`
line from your Hyprland config. The backup manifest records each overwritten
file; restore individual files after checking for subsequent edits. Do not
restore an old full shell config over newer customizations.

## Development and licence

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and
[CREDITS.md](CREDITS.md). MIT, with upstream notices retained in [LICENSE-OMA](LICENSE-OMA).
