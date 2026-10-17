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

Quiet only mutes local playback; it does not mute input, cancel work or end Talk.
End voice releases call resources without claiming that host work stopped. The
last received final text excerpt can remain in private runtime state after End
or audio failure, until dismissed, the next call or companion shutdown. No
transcript history is added. Exact request cancellation is unavailable for the
current native route; see [interruption controls](docs/INTERRUPTIONS.md).

The explicitly opened answer reader keeps a separate bounded beginning of the
most recent received reply in private volatile runtime state. End/failure retain
partial or final text; dismissal, a new call and shutdown clear it. Stale state
hides it. Text is literal, and only deliberate copy actions write the clipboard.
Copied text can be retained by desktop clipboard managers. The separate link
list allows only bounded HTTP/HTTPS URLs without embedded credentials or control
characters, opened through Qt only on explicit activation. It adds no HTML or
code execution. See [answer limits](docs/ANSWERS.md).

Hold-to-talk starts muted, admits input only after verified readiness, and uses
UI/daemon/native leases plus a maximum press duration. Release defaults to input
mute with capture still open; `holdRelease: "end"` ends capture and playback.
Retired presses cannot reopen input. No background pre-roll, submitted transcript,
request commit, cancellation or completion claim is added. See
[hold safety and proof limits](docs/HOLD-TO-TALK.md).

Audio setup uses read-only bounded local discovery and private device preferences.
Device changes, voice/wake ownership and the explicit local test tone are mutually
exclusive. The tone path has no input, SDK, speech provider or recordings, and is
bounded to two seconds with Stop/Close/EOF/signal cleanup. Missing or stale devices
cannot start audio; observed binding changes end local ownership without restart.
PulseAudio elements receive pinned names and request PipeWire no-move/fallback/
reconnect properties. Device identities stay outside general diagnostics; no
desktop defaults, permissions or Gateway approvals are changed. See
[audio binding and physical-test limits](docs/AUDIO-DEVICES.md).

Action cards confirm transcription only, then report unknown outcomes. Provider
replies and tool-shaped payloads cannot establish host success or cancellation.
Their correlation ledger and visible cards are bounded and volatile; they add
no execution payloads to diagnostics. See [action observations](docs/ACTION-PROGRESS.md)
for the upstream contract required to finish result tracking.

Destination presets resolve existing agents, exact sessions and any configured
execution node through read-only Gateway discovery. They supply a session key
to ordinary Talk creation without changing permissions or approvals. Selection
is blocked during audio ownership and until retained outcomes are explicitly
reviewed/dismissed. The instance's private selection file stores routing identity
only; general diagnostics exclude it. Stale or unavailable destinations cannot
start audio and never select another agent as a fallback. See
[destination boundaries](docs/DESTINATIONS.md).

Startup diagnostics expose bounded monotonic durations and closed milestone/error
codes through a separate local command. They exclude speech, credentials,
connection identifiers and endpoints. Recovery guidance comes from local text,
not upstream error messages. Ready requires microphone frames, native transport
and current Talk readiness; reconnect never activates capture. See
[startup readiness](docs/STARTUP-READINESS.md).

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
