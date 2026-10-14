# Permissions and compatibility audit

Source audit dated 25 September 2026, against OpenClaw commit
`b770a861bd80a15ec04eee5a4ac7053ddd0079c2`. This records the direct RPC surface;
it is not a tested least-privilege grant for a complete agent-consult call.
The bridge's existing requested scope set remains unchanged:
`operator.admin`, `operator.read`, `operator.write`, `operator.approvals`.

| Direct call made by this bridge | Purpose | Pinned-main method scope |
| --- | --- | --- |
| `config.get` | Check visible OAuth/provider configuration | `operator.read` |
| `talk.catalog` | Check realtime voice readiness | `operator.read` |
| `talk.client.create` | Reserve a WebRTC session using agent-consult | `operator.talk` |
| `talk.client.close` | Release the bridge's voice session | `operator.talk` |

Sources: [core method descriptors](https://github.com/openclaw/openclaw/blob/b770a861bd80a15ec04eee5a4ac7053ddd0079c2/src/gateway/methods/core-descriptors.ts),
[scope compatibility](https://github.com/openclaw/openclaw/blob/b770a861bd80a15ec04eee5a4ac7053ddd0079c2/src/shared/operator-scope-compat.ts),
and [authorization resolver](https://github.com/openclaw/openclaw/blob/b770a861bd80a15ec04eee5a4ac7053ddd0079c2/src/gateway/method-scopes.ts).

At that commit, `operator.write` also satisfies the read and talk scopes, while
admin satisfies operator-scoped checks broadly. The bridge does not directly
call an approval-resolution RPC. None of these facts establishes that narrowing
the grant preserves gateway-side agent consultation, event delivery, token
refresh, tool confirmation or older candidate compatibility. Agent-consult runs
on the Gateway and may depend on authority beyond these four entrypoint checks.
The HTTP SDP request uses only the scoped voice-session credential.

A future scope reduction requires a separate isolated enrollment and complete
start/stop, reconnect, tool yes/no and cancellation test on the selected exact
Gateway/node/SDK target. Do not silently edit an existing paired device grant,
add node commands, or weaken approval policy to make the test pass. Status
reports requested-versus-actual connection metadata; absent scope metadata is
unknown. This preparation changes neither live grants nor the requested array.

Treat the present client as broad trusted operator access, not a microphone-only
permission. Someone who controls the local user can control its service and
OpenClaw store. The plugin itself shares Omarchy's unsandboxed shell process.
