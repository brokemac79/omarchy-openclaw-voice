# Security and privacy

The service accepts launcher commands through a Unix socket with mode `0600`
in a `0700` user runtime directory. There is no TCP listener, web page, browser
capability token or HTTP control API. One service owns the socket and one audio
worker owns a call. The worker receives SDP and stable audio device names over
stdio; OpenClaw credentials stay in the Node service and OpenClaw's own store.

Plain WebSocket/HTTP gateway connections are restricted to loopback origins.
Non-loopback gateways require TLS. Gateway token/password credentials are used
only for the selected local or remote gateway; local credentials are never
sent to a remote target. The HTTP voice offer uses only its scoped session
credential, never the gateway token. Unsupported secret references fail closed.

The gateway connection uses existing OpenClaw device authentication and broad
operator scopes needed by the integration. Treat access to the local user
account, paired device store and gateway as trusted administrative access.
Unix permissions are not a defence against an attacker who controls that user.

The app starts audio only on explicit invocation, releases media on Stop and
disconnect, and does not reconnect a microphone automatically. It requests only
audio. Captions are rendered as plain text. Current captions and levels are
volatile runtime state; this app does not save audio or transcript history.
The gateway and provider have separate data retention policies.

OAuth checks cover configuration returned by the gateway, not hidden environment
credentials or future provider behaviour. Existing reasoning fallbacks are
not removed. Review those separately when controlling provider costs.

Keep configuration and credentials outside this checkout with mode `0600`.
Keep private investigation material under ignored `docs/private/`; never upload
it as an issue, attachment, release or CI artifact. The publication checker
supplements manual review and cannot guarantee that a commit is safe.

Report security issues privately to the repository owner. Use GitHub private
vulnerability reporting if enabled. Do not open a public issue with credentials,
private URLs, recordings or conversation details.
