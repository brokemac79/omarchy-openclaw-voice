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
operator scopes retained for the existing integration. Their necessity has not
been established as a least-privilege set; see [the source audit](docs/PERMISSIONS.md). Treat access to the local user
account, paired device store and gateway as trusted administrative access.
Unix permissions are not a defence against an attacker who controls that user.

The app starts audio only on explicit invocation, releases media on Stop and
disconnect, and does not reconnect a microphone automatically. It requests only
audio. Captions are rendered as plain text. Current captions and levels are
volatile runtime state; this app does not save audio or transcript history.
The gateway and provider have separate data retention policies.

Optional wake support is disabled by default. Explicitly arming Standby opens a
local detector microphone; Standby is not microphone off. Its bounded frames
remain local and are not recorded or sent to the Gateway/provider. Detection
releases that input before a fresh ordinary Talk connection. Stop, errors and
disconnect disarm it; reconnect and boot never arm it. The supported conversation
mode does not return to Standby automatically; one-request return remains
disabled pending a correlated completion contract. A wake is not authentication
or approval. Model licences and runtime qualification are independent of the
application licence; see [wake activation](docs/WAKE-WORD.md).

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


Marketplace enable loads QML in the unsandboxed Omarchy process, with the user's
file/process privileges. It does not run the installer. Companion setup is a
separate preview/apply operation; it stops an existing default unit and installs
user files but leaves the unit stopped. Service start connects to the selected
Gateway and can require normal pairing; only explicit voice invocation opens
audio. Disable/removal of the QML plugin does not stop that separate companion.
Stop voice first, and remove the companion separately if it is no longer wanted.

The SDP response accumulator is capped at 131072 UTF-8 bytes before decoding,
including streamed bodies without Content-Length. The exchange has a 25-second
deadline; Stop, failure and deadline cancel pending input. Transport/library
buffers are outside this application-level bound. Shortcuts are opt-in, and
file recovery checks hashes/modes to avoid replacing later user edits.
