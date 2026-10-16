# Vision

Make talking to an existing OpenClaw agent feel native on Omarchy: an explicit,
observable voice session controlled from the desktop bar, with useful captions
and clear recovery when a call cannot start.

## Principles

- **User control first.** Microphone capture starts only after an explicit voice
  action and stops on End, errors and disconnect. Wake support remains opt-in.
- **OpenClaw owns the agent.** Use its gateway, authentication and approval
  controls; the desktop interface must not silently approve work or select a
  different agent.
- **Private by design.** Keep credentials in OpenClaw's store and conversation
  content in volatile local state. Do not add recordings or transcript history.
- **Native and honest.** Use Omarchy's bar and audio stack, show actual session
  state, and document compatibility and test limits rather than implying that
  synthetic checks prove live microphone behaviour.
- **Respect upstream work.** Preserve OMA and OpenClaw attribution and licence
  notices for adapted components.

## Scope

This is an Omarchy interface for an existing OpenClaw gateway, not a replacement
gateway, a general agent backend, or an API-key speech-provider bundle. New
features should improve reliability, accessibility or user control without
weakening those boundaries. See [README.md](README.md), [SECURITY.md](SECURITY.md)
and [CONTRIBUTING.md](CONTRIBUTING.md) for current behaviour and contribution
checks.
