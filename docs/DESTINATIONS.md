# Visible agents and destination presets

The bar shows the selected agent and its configured node or conversation context,
including Unavailable/Stale state before a call starts. Hover for the full label;
the compact bar can elide long names. The conversation status and deliberately
opened Voice controls show the full selection. No text is interpreted as markup.

Right-click the bar for Voice controls. Select an existing preset there; setup
stays in the private companion configuration. A selection never starts voice.
Refresh destinations updates discovery without starting a service or microphone.
Call startup checks the selected destination again before sending native audio.

## Configure existing conversations

Keep the usual explicit `sessionKey`. The historical default remains
`agent:main:main`; it is still checked against discovery and is never replaced
by whatever agent the Gateway reports as its default. Noncanonical keys or
aliases such as `main` must be replaced with an exact existing agent/session key.
The companion does not create sessions, agents or nodes for these presets.

Add up to seven additional presets in your private companion `config.json`:

```json
{
  "sessionKey": "agent:example:main",
  "destinationLabel": "General conversation",
  "destinations": [
    {
      "id": "work",
      "label": "Work conversation",
      "sessionKey": "agent:helper:work",
      "nodeId": "example-workstation"
    }
  ]
}
```

These are synthetic identifiers, not provisioned destinations. Substitute exact
existing session keys and node IDs from your Gateway. Preset IDs use lowercase
letters/digits, underscores or hyphens, up to 32 characters. Labels are bounded
plain text. Duplicate IDs or session keys are rejected. Restart the companion
after editing setup; restart leaves capture off.

An optional `nodeId` pins the expected **already configured session context**.
The session's discovered `execNode` must match that exact node, and the node must
be connected and not explicitly unpaired. This field does not set a node, grant
access or inject instructions. Configure the destination in OpenClaw first.
Without a node pin, the UI shows the session's discovered execution node if one
exists. Otherwise it says Gateway-selected execution; no host is guessed.

The preset routes ordinary Talk creation using that exact session key. It adds
no identity, capability, permission, prompt, approval or node mutation. Gateway
and node policy remain authoritative, including ordinary clarification of
ambiguous actions. A displayed node is observed session context, not a promise
that every tool must execute there. The Gateway can still refuse an action or
apply its normal routing rules.

## Switching and conversation boundaries

End voice before selecting another destination. Standby, acquisition, active
Talk and microphone cleanup all block selection. After any call, review retained
text and unknown action outcomes, then explicitly **Dismiss results** to unlock
selection. Ending the call alone does not erase those outcomes or enable a switch.
Dismissing during an active call does not unlock selection afterward; review
again once voice has ended. Dismissal does not cancel submitted host work.

Switching waits for the previous session's pending release before changing the
selection. Live captions belong to one call and clear on End; retained text and
cards remain under the old destination until explicitly dismissed. The next
call starts with fresh captions/cards. Reservation and late-grant cleanup retain
the original session key, and incoming Talk events must match the active voice
session. An old agent's late reply cannot become the new agent's caption.

The selected preset and observed session/node binding persist in the instance's
private `destination.json`, mode `0600`, beside companion configuration. Only
routing identity is stored there; no speech or results are persisted. A corrupt
file, removed preset or changed saved binding requires deliberate reselection.
There is no fallback to another agent or a privileged default.

## Discovery and recovery

Discovery runs at connection and every 30 seconds. A snapshot expires after 45
seconds using a monotonic clock; each call and explicit selection refreshes it.
Missing/degraded agents, absent/archived sessions, unresolved keys, offline or
mismatched nodes and discovery errors fail closed. Discovery does not inspect
transcript tails or request model-generated titles. A stale/disconnected result
cannot authorize voice activation, even if a late discovery reply arrives.

If a periodic/explicit refresh observes that an active destination disappeared
or its execution binding changed, the companion ends local voice and retains
unknown outcomes. A changed binding requires explicit reselection after review.
This does not undo or retarget host work already admitted by the Gateway, and
cannot prevent an external administrator from changing Gateway routing between
observations. Reconnect refreshes labels but never starts audio.

Use the same instance launcher:

```sh
openclaw-voice destinations
openclaw-voice select-destination work
```

Both commands require an existing companion and never start one. The selector
passes a literal preset ID through the private socket, not a session key or
shell command. Failed selection leaves the previous destination intact.
General diagnostics exclude destination names, node identities and session keys.

## Contract and validation

The source audit uses public OpenClaw revision
`d6d7435f59ec2c5aba5b7f571815a1def75a404c`:

- [Agent discovery](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/gateway/server-methods/agents-list.ts)
  and [node discovery](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/gateway/server-methods/nodes.read.ts).
- [Exact session resolution](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/packages/gateway-protocol/src/schema/sessions-resolve.ts)
  and the [session-row execution context](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/packages/gateway-protocol/src/schema/sessions-row.ts).
- [Talk creation parameters](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/packages/gateway-protocol/src/schema/channels.ts)
  and the [Gateway-owned native route](https://github.com/openclaw/openclaw/blob/d6d7435f59ec2c5aba5b7f571815a1def75a404c/src/gateway/talk/handlers/client-create.ts).

Run the Node and Python unittest suites, then `python3 test/qml_destinations.py`
in Omarchy. Tests use synthetic agents/nodes, fake SDK and media workers, the
real daemon/socket/owner, private file persistence and actual QML components.
They cover discovery changes, unavailable/stale targets, selection persistence,
explicit switching, review boundaries, active-call refusal and old-call event
isolation. No physical audio devices, live providers or real agent tools run.
