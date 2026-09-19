export const MODEL = 'gpt-live-1-codex';
export const OFFER_PATH = '/plugins/openai/realtime/calls';

export function checkVoiceConfig(config) {
  const profiles = Object.values(config.auth?.profiles ?? {}).filter(p => p.provider === 'openai');
  if (!profiles.some(p => p.mode === 'oauth') || profiles.some(p => p.mode !== 'oauth')) {
    throw new Error('Voice requires an OpenAI ChatGPT OAuth profile without an API profile.');
  }
  const rt = config.talk?.realtime ?? {};
  if (rt.apiKey || rt.providers?.openai?.apiKey || config.models?.providers?.openai?.apiKey ||
      config.env?.OPENAI_API_KEY || config.env?.vars?.OPENAI_API_KEY) {
    throw new Error('An OpenAI API key is configured. Review the gateway voice configuration.');
  }
  return { fallbackModels: config.agents?.defaults?.model?.fallbacks ?? [] };
}

export function checkGrant(grant) {
  if (grant.provider !== 'openai' || grant.transport !== 'webrtc' || grant.model !== MODEL ||
      grant.clientControl?.owner !== 'gateway' || grant.offerUrl !== OFFER_PATH ||
      !grant.voiceSessionId || !grant.clientSecret) {
    throw new Error('The gateway did not return the expected GPT-Live voice connection.');
  }
}

export function isAuthorized(req, key, origin) {
  return req.headers.host === new URL(origin).host &&
    (!req.headers.origin || req.headers.origin === origin) && req.headers['x-ant-voice-key'] === key;
}

export function validateGateway(value) {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Configure a secure wss:// gateway origin in OpenClaw.');
  }
  return url.origin;
}

export function level(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
