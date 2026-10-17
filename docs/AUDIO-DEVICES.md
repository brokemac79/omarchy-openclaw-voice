# Audio devices and a local test tone

On main, right-click the voice bar icon and open **Audio setup**. Choose a
microphone and a speaker/headphone device from the lists. Each entry includes
its stable PulseAudio name so duplicate descriptions remain distinguishable.
Device discovery uses read-only `pactl --format=json` commands against Omarchy's
PipeWire/PulseAudio server. It does not change system defaults or open audio.
Monitor sources are excluded from microphone choices.

End voice and standby before selecting another device. A local test also blocks
selection and voice activation. Starting voice or standby refreshes discovery
again and resolves the selected device before native audio starts. Explicit
device selections never fall back to another inventory entry. A missing device
stays visible as unavailable; reselect it or deliberately choose another one.

**System default** follows the observed default between explicit activations.
At activation, the companion pins its resolved stable name for that owner.
A changed default or a disappearing device invalidates the active binding and
ends local audio; reconnect and reappearance never restart it automatically.
Discovery refreshes every two seconds and expires after ten seconds. Failed or
stale discovery cannot authorize a new call or check.

## Play and stop a tone

**Play test sound** explicitly plays a low-amplitude 440 Hz tone through the
selected output for at most two seconds of the native check's lifetime. It
honours desktop output volume without changing that volume. **Stop check**,
Close and Escape also stop it. The separate stop control remains usable while
the start command is pending. The bar identifies a local speaker check and
keeps the microphone-off distinction visible.

The test path contains a tone generator and output only. It has no microphone,
recording, speech recognition, Talk session, Gateway request or provider. The
companion can keep its ordinary Gateway connection while a local check runs.
The owner selected this simple tone scope; microphone checking and input
metering are deferred.

If the shell disappears or control delivery fails, the native worker's own
two-second deadline still bounds playback. Control EOF, failure and process
signals release the pipeline. An unconfirmed process release blocks subsequent
audio until the companion is stopped. No UI closure is an agent cancellation.

## Preferences and native binding

The instance's private `audio.json`, beside `config.json`, stores only input and
output names (or null for System default), with mode `0600`. Existing configured
`inputDevice`/`outputDevice` values seed selection until a saved preference exists;
saved preferences take precedence afterward. Restart leaves calls, wake and
checks off. Corrupt saved preferences require explicit input and output choices
before a repaired file is saved. Failed writes preserve the prior selection.

The native PulseAudio elements receive an explicit device name and request
PipeWire's no-fallback, no-move and no-reconnect stream properties. The Talk
worker also checks observed current-device identity; the wake worker rejects
samples from an observed changed input. These controls stop on detected changes;
they cannot guarantee routing against an administrator overriding audio-server
policy. Device selection does not pin a physical jack/port within a device.
See the upstream [GStreamer source properties](https://gstreamer.freedesktop.org/documentation/pulseaudio/pulsesrc.html)
and [WirePlumber linking policy](https://pipewire.pages.freedesktop.org/wireplumber/policies/linking.html).

Device identities are local private configuration/UI state and are excluded
from general diagnostics. Authentication, approvals and provider choices remain
owned by OpenClaw. Opening Audio setup never starts a missing companion service.

## Validation

Node tests use fake inventories and workers for selection, persistence, stale
discovery, default changes, unplug, ownership, cancellation during startup and
release failures. The real-daemon fixture uses fake `pactl`, SDK and native
workers, proving local tone controls cannot create Talk or wake ownership.

`python3 test/native_audio_check.py` checks actual generated tone samples through
a GStreamer fake sink, expiry, NULL-state release, SIGTERM and EOF. It never opens
a physical input or output. Existing generated WebRTC and wake checks cover the
native worker changes. `python3 test/qml_audio_devices.py` checks actual Omarchy
components with synthetic owner state, keyboard selection, simulated touch
Play/Stop/Close, literal arguments and small-screen scrolling. No real control
or audio is invoked by that UI fixture. Captures remain private and synthetic.

These checks do not establish physical headphones, Bluetooth/port switching,
microphone quality or live provider behaviour. No owner participation is needed
for the automated checks above.
