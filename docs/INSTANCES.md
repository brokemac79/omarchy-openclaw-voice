# Separate voice instances

`OPENCLAW_VOICE_INSTANCE` selects the daemon and launcher instance. Omit it or
use `default` for the existing paths. Other names contain 1–32 lowercase
letters, digits, underscores or hyphens, starting with a letter or digit.
Explicit empty or invalid names fail before control or service operations.

For `test`, the basename is `openclaw-voice-test`. The socket, state and level
files live under `$XDG_RUNTIME_DIR/openclaw-voice-test/`; voice options live at
`$XDG_CONFIG_HOME/openclaw-voice-test/config.json` (normal HOME fallback).
All launcher start, stop and failure cleanup targets `openclaw-voice-test.service`.
Keep the real runtime, home and audio environment. Do not globally import
instance variables into the desktop or systemd user manager.

Create a separate user unit and a dedicated wrapper that fixes the instance,
source and OpenClaw home/state/config environment. Preserve the existing
unit's `KillMode=control-group`, private umask and audio-child cleanup.
The stock installer updates the default installation; it does not provision
test instances and should not be used for a side-by-side trial.

Each QML component has a `voiceInstance` property, defaulting to `default`.
The indicator also has `voiceControl`: an absolute dedicated wrapper path for
named instances. Set these per component in a separate UI harness or supported
plugin configuration. Environment variables on the daemon do not configure QML.
The indicator also reads these properties from its supported per-widget settings.
The indicator uses a Process argument array, including for paths with spaces.
Missing/invalid named control is shown as unconfigured and cannot launch the
default widget. Both components import `openclaw-voice-shared/Instance.js` next
to their plugin directories; include that directory when staging a harness.

## Returning from a test instance

The bar control and conversation panel must select the same instance. For the
normal installation, restore the indicator's `voiceInstance` to `default` and
clear its `voiceControl` override. The installed `openclaw-voice.orb` manifest's
`entryPoints.panel` should select the stock `VoiceOrb.qml`, not a test wrapper
that fixes a different `voiceInstance`.

Check `openclaw-voice status` and `openclaw-voice preflight` before starting a
call. These checks do not start microphone capture. A healthy normal service
does not prove that a bar button still bound to a test launcher can reach it.

On the tested Omarchy shell, plugin reload could restore an older inline bar
selector after settings had been changed in place. If the saved settings are
correct but the button still invokes the old test setup, end any active call
and use the supported `omarchy-restart-shell` command. This reloads the saved
layout without reinstalling the voice service. The bubbles should appear while
a call is active and clear on Stop.

## Gateway and authentication

Set `openclawConfig` and `gatewaySdk` explicitly in the selected voice options.
The former wins over `OPENCLAW_CONFIG_PATH`; changing OpenClaw state/home alone
does not redirect the default SDK. Status reports the actual imported SDK path
and available build metadata, without falling back if its exports are missing.

The native operator widget now identifies as generic `gateway-client` with
`mode: ui`. This uses ordinary signed UI pairing rather than the local backend
pairing exemption. Existing installations may need their pairing metadata
reviewed on upgrade. Test fresh enrollment in isolated state first.

The private socket status includes `gatewayConnection`: actual hello auth method,
granted role/scopes, server version/build and connection identifiers. It is null
after disconnect/error. No token-bearing hello is retained. Missing metadata
is unknown, never inferred from requested scopes or the presence of an identity.

For device-token acceptance, enroll the fresh widget identity normally, then
remove both remote token/password properties and their temporary environment
secret. Keep its identity store and exact Gateway URL, restart only that
instance, and verify a live `device-token` hello again after reconnect. Provider
OAuth, ordinary tool permissions and scoped Talk grants remain separate.

Run `npm test` and `python3 -m unittest discover -s test -p 'test_*.py'` for
offline regressions. On Omarchy, `python3 test/qml_instances.py` loads the actual
components with synthetic state and a fake control executable. It opens no
audio devices and does not change installed plugins. `python3 test/native_audio.py`
separately checks native audio with generated tones and fake sinks.
