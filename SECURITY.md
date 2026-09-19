# Security and privacy

The local bridge listens only on loopback and requires a random per-process
capability token, with Host and Origin checks. Its token and native state are
stored under the user's runtime directory with restrictive permissions. The
background browser receives its token in memory, not a URL or command line.
Only one audio controller can connect at a time.

The gateway connection uses existing OpenClaw device authentication and broad
operator scopes needed by the integration. Treat access to the local user
account, paired device store and gateway as trusted administrative access.
The loopback token is not a defence against an attacker who controls that user.

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
