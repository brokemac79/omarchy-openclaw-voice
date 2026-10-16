// Closed, local presentation vocabulary. Never display an upstream error message.
const errors = {
  gateway_unavailable: ['Gateway unavailable', 'Check that your configured Gateway is running and reachable, then try again.'],
  gateway_disconnected: ['Gateway disconnected. Microphone off.', 'Reconnect the Gateway, then start voice again.'],
  pairing_required: ['Device pairing required', 'Approve this device in OpenClaw, then start voice again.'],
  pairing_failed: ['Device pairing needs attention', 'Review or renew this device pairing in OpenClaw, then try again.'],
  gateway_auth_required: ['Gateway authentication failed', 'Check the selected Gateway credentials or device access, then try again.'],
  gateway_incompatible: ['Gateway connection is incompatible', 'Check the supported Gateway and companion versions before retrying.'],
  gateway_rate_limited: ['Gateway authentication is rate limited', 'Wait before trying again, and check the selected Gateway credentials.'],
  voice_config_unavailable: ['Could not check voice configuration', 'Check Gateway access and voice configuration, then try again.'],
  oauth_required: ['Voice needs ChatGPT sign-in', 'Configure ChatGPT OAuth for speech on the Gateway, then try again.'],
  api_key_disallowed: ['Voice API-key configuration is not supported', 'Review Gateway speech settings and use the ChatGPT OAuth route.'],
  provider_not_ready: ['Voice provider is not ready', 'Check Gateway voice/provider readiness and ChatGPT sign-in, then try again.'],
  provider_session_failed: ['Could not prepare a voice session', 'Check Gateway voice/provider settings, then try again.'],
  provider_contract_mismatch: ['Unexpected voice connection', 'Check the supported Gateway and companion versions before retrying.'],
  native_unavailable: ['Native audio worker unavailable', 'Check the configured Python and GStreamer dependencies, then try again.'],
  audio_setup_failed: ['Could not prepare audio', 'Check the selected microphone, speakers and audio permissions, then try again.'],
  audio_transport_failed: ['Audio connection failed', 'Check the network and selected audio devices, then start voice again.'],
  audio_setup_timeout: ['Audio preparation timed out', 'Check audio devices and Gateway/provider readiness, then try again.'],
  offer_failed: ['Voice connection exchange failed', 'Check Gateway/provider availability and network access, then try again.'],
  offer_timeout: ['Voice connection exchange timed out', 'Check the network and Gateway/provider availability, then try again.'],
  provider_session_error: ['Voice session failed', 'Check Gateway voice/provider readiness, then start voice again.'],
  wake_unavailable: ['Local wake detector unavailable', 'Check the selected local model and detector dependencies, then arm standby again.'],
  release_unconfirmed: ['Audio release unconfirmed', 'Stop the companion service before trying again.'],
  voice_start_failed: ['Could not start voice', 'Check voice configuration, audio devices and Gateway readiness, then try again.'],
};

export class VoiceError extends Error {
  constructor(code) {
    const safe = Object.hasOwn(errors, code) ? code : 'voice_start_failed';
    super(errors[safe][0]); this.code = safe;
  }
}
export function failureDetails(error, fallback = 'voice_start_failed') {
  const code = error instanceof VoiceError ? error.code : new VoiceError(fallback).code;
  return { code, message: errors[code][0], recovery: errors[code][1] };
}
export function gatewayFailure(error) {
  const codes = [error?.details?.code, error?.code];
  if (codes.some(code => ['PAIRING_REQUIRED', 'NOT_PAIRED', 'DEVICE_NOT_PAIRED'].includes(code))) return new VoiceError('pairing_required');
  if (codes.some(code => ['PAIRING_REJECTED', 'PAIRING_EXPIRED'].includes(code))) return new VoiceError('pairing_failed');
  if (codes.includes('AUTH_RATE_LIMITED')) return new VoiceError('gateway_rate_limited');
  if (codes.some(code => ['PROTOCOL_MISMATCH', 'CLIENT_VERSION_MISMATCH', 'CONTROL_UI_BUILD_MISMATCH'].includes(code))) return new VoiceError('gateway_incompatible');
  if (codes.some(code => ['AUTH_REQUIRED', 'AUTH_TOKEN_MISMATCH', 'AUTH_TOKEN_MISSING', 'AUTH_TOKEN_NOT_CONFIGURED',
    'AUTH_UNAUTHORIZED', 'UNAUTHORIZED', 'AUTH_DEVICE_TOKEN_MISMATCH', 'AUTH_PASSWORD_MISSING', 'AUTH_PASSWORD_MISMATCH',
    'AUTH_PASSWORD_NOT_CONFIGURED', 'AUTH_SCOPE_MISMATCH', 'DEVICE_AUTH_INVALID', 'DEVICE_IDENTITY_REQUIRED',
    'CONTROL_UI_DEVICE_IDENTITY_REQUIRED', 'OPERATOR_ACCESS_DENIED'].includes(code))) return new VoiceError('gateway_auth_required');
  return new VoiceError('gateway_unavailable');
}
