import { MODEL, checkGrant, checkVoiceConfig } from './policy.mjs';

// A cancelled startup must close even a grant that arrives after Stop.
export class VoiceSession {
  constructor(rpc, sessionKey, voice = 'cove') {
    this.rpc = rpc; this.sessionKey = sessionKey; this.voice = voice;
    this.epoch = 0; this.grant = null; this.creating = false; this.closing = Promise.resolve();
    this.pending = Promise.resolve();
  }
  async preflight() {
    const snapshot = await this.rpc('config.get');
    const config = snapshot.config ?? snapshot.parsed;
    if (!config || typeof config !== 'object') throw new Error('Cannot verify gateway voice configuration.');
    const policy = checkVoiceConfig(config);
    const catalog = await this.rpc('talk.catalog');
    if (!catalog.realtime?.ready) throw new Error('Gateway realtime voice is not ready.');
    return policy;
  }
  create() {
    if (this.creating || this.grant) return Promise.reject(new Error('Voice is already starting or active.'));
    const epoch = this.epoch;
    this.creating = true;
    this.pending = this.acquire(epoch, this.closing);
    return this.pending;
  }
  async acquire(epoch, previousClose) {
    try {
      await previousClose;
      await this.preflight();
      if (epoch !== this.epoch) throw new Error('Voice startup cancelled.');
      const grant = await this.rpc('talk.client.create', {
        sessionKey: this.sessionKey, provider: 'openai', model: MODEL, voice: this.voice,
        mode: 'realtime', transport: 'webrtc', brain: 'agent-consult', capabilities: ['gateway-control-v1'],
      });
      try {
        checkGrant(grant);
        if (epoch !== this.epoch) throw new Error('Voice startup cancelled.');
      } catch (error) {
        if (grant.voiceSessionId) await this.closeGrant(grant);
        throw error;
      }
      this.grant = grant;
      return { voiceSessionId: grant.voiceSessionId, model: MODEL };
    } finally { this.creating = false; }
  }
  closeGrant(grant) {
    return this.rpc('talk.client.close', { sessionKey: this.sessionKey, voiceSessionId: grant.voiceSessionId });
  }
  async close() {
    this.epoch++;
    const old = this.grant; this.grant = null;
    // A late grant belongs to the cancelled call. Finish releasing it before
    // allowing a new engine to reserve another provider session.
    this.closing = Promise.allSettled([this.closing, this.pending, old ? this.closeGrant(old) : undefined]);
    await this.closing;
  }
}
