# Hold to talk

Open **Voice controls → Hold to talk**. Press and hold the large button, or hold
Space while this panel has focus. Wait for **Ready — Speak now** before speaking.
There is no intentional pre-roll. Release stops admitting microphone speech.
Opening the panel alone never starts audio.

The first hold prepares a muted call and waits for native capture, transport and
Gateway Talk readiness before admitting input. Releasing before readiness cancels
startup and releases any late grant/worker. Repeated holds in an existing hold
session use the same selected conversation and microphone owner. Renewals do not
create another session, submit a transcript or send a request-commit command.

## Choose what release does

Set `holdRelease` in the instance's private companion `config.json`, then restart
the companion while voice is stopped:

| Value | Behaviour |
| --- | --- |
| `"mute"` (default) | Mute microphone transmission and keep the session open so the reply can continue. Capture remains open; the interface says **Input muted**, never Microphone off. Hold again for a follow-up. |
| `"end"` | End the voice session and release capture/playback. The reply stops locally. Submitted host work can continue. |

Invalid values fail configuration loading. The panel describes the active
setting. Release during startup always cancels startup, for either setting.
Close, Escape, focus loss and touch cancellation release a panel hold with the
same configured behaviour. **Quiet** still controls playback independently.
**End voice** always ends local voice ownership. No release mode claims host
work completion or cancellation.

End conversation or wake standby before entering hold mode. After ending a
session, review retained text and unknown outcomes and dismiss results before
changing modes or destinations. A held input never silently replaces another
mode. Restart and Gateway reconnect leave input off.

## Optional global keyboard shortcut

The focused panel's Space key works without a desktop binding. For a global
shortcut, explicitly enable **Enable configured Hyprland hold-to-talk shortcut**
in the plugin settings. It registers a Quickshell global shortcut named
`hold-to-talk`, with the instance basename as its application ID:
`openclaw-voice` for the default instance, or `openclaw-voice-NAME` for a named one.
Bind that global action to your chosen chord using your Hyprland configuration.
No existing binding is replaced, and installation adds no global shortcut.
Disable the setting to unregister it and release any held shortcut.

The global shortcut supplies press/release events; key repeats cannot create
another press. Focus loss releases a panel press. Global presses follow the
compositor's shortcut events and have the same bounded watchdog if release is
lost. This is not a new listening mode enabled at login.

## Input safety and turn limits

Every physical press has a separate bounded identifier. Independent release IPC
can overtake startup; a retired identifier cannot subsequently start or renew
that press. Overlapping presses close the existing gate and require a fresh
press. The UI renews held input every 200 ms; the daemon expires a missing lease
after 600 ms. The native worker independently expires its 750 ms lease, checked
by its 250 ms heartbeat, so a stalled daemon cannot leave speech admitted
indefinitely. Each press has a 30-second maximum that renewal cannot extend.
Audio already in ordinary device/transport buffers can have a short tail.

Between holds, the native input volume gate sends silence; it does not stop
physical capture in the default setting. This is the existing input-mute path,
independent of the reply volume gate. Lost UI/control, errors and disconnect
cannot automatically reopen a retired hold. Explicit End/error/disconnect closes
the native owner; an unconfirmed release blocks replacement ownership.

Provider/Gateway speech detection still determines turn boundaries. A pause can
split speech while held, and release is not an exact one-request commit. This
feature does not change provider VAD, inject transcripts, create duplicate
submission RPCs, or qualify automatic return-to-wake completion. The pinned
[Gateway client contract](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/src/gateway/talk/handlers/client.ts)
and [provider session policy](https://github.com/openclaw/openclaw/blob/9ad5e98edb514da1ceb4d98af1b8a2817d6eb8aa/extensions/openai/realtime-voice-session-policy.ts)
remain authoritative for speech admission and responses. There is no new
permission, approval shortcut, credential path or speech provider.

## Verification

Node tests cover the real owner/controller, readiness, release-before-acquisition,
late worker disposal, repeated holds, lost release, overlap, watchdog, disconnect,
mode/review guards and both release settings. A real-daemon fixture uses a fake
SDK and worker to prove that renewals/follow-ups retain one call and reconnect
never resumes input.

`python3 test/native_hold.py` uses actual generated GStreamer/WebRTC audio and
fake sinks. It checks muted startup, input opening/release, continuing reply
audio, follow-ups, native expiry, late-renewal refusal, Quiet and cleanup.
`python3 test/qml_hold.py` checks the actual Omarchy renderer with a fake launcher,
real synthetic keyboard events, simulated touch, cancellation/focus/Close,
opt-in shortcut events, short layout, readiness and literal arguments.
No tests open physical audio devices or contact a provider. These checks do not
prove physical input latency, a configured human keyboard chord, hardware audio
quality or live provider turn timing.
