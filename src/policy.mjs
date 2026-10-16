import { VoiceError } from './voice-errors.mjs';

export const MODEL = 'gpt-live-1-codex';
export const OFFER_PATH = '/plugins/openai/realtime/calls';

export function checkVoiceConfig(config) {
  const profiles = Object.values(config.auth?.profiles ?? {}).filter(p => p.provider === 'openai');
  if (!profiles.some(p => p.mode === 'oauth') || profiles.some(p => p.mode !== 'oauth')) {
    throw new VoiceError('oauth_required');
  }
  const rt = config.talk?.realtime ?? {};
  if (rt.apiKey || rt.providers?.openai?.apiKey || config.models?.providers?.openai?.apiKey ||
      config.env?.OPENAI_API_KEY || config.env?.vars?.OPENAI_API_KEY) {
    throw new VoiceError('api_key_disallowed');
  }
  return { fallbackModels: config.agents?.defaults?.model?.fallbacks ?? [] };
}

export function checkGrant(grant) {
  if (!grant || grant.provider !== 'openai' || grant.transport !== 'webrtc' || grant.model !== MODEL ||
      grant.clientControl?.owner !== 'gateway' || grant.offerUrl !== OFFER_PATH ||
      !grant.voiceSessionId || !grant.clientSecret) {
    throw new VoiceError('provider_contract_mismatch');
  }
}

export function validateGateway(value) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use a wss:// gateway origin, or ws:// on loopback only.');
  }
  return url.origin;
}

export function level(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
