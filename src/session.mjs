import { MODEL, checkGrant, checkVoiceConfig } from './policy.mjs';
import { VoiceError } from './voice-errors.mjs';

// A cancelled startup must close even a grant that arrives after Stop.
export class VoiceSession {
  constructor(rpc, sessionKey, voice = 'cove') {
    this.rpc = rpc; this.sessionKey = sessionKey; this.voice = voice;
    this.epoch = 0; this.grant = null; this.creating = false; this.closing = Promise.resolve();
    this.pending = Promise.resolve();
  }
  async preflight(onProgress = () => {}) {
    onProgress('voice-checks-started');
    let snapshot;
    try { snapshot = await this.rpc('config.get'); }
    catch { throw new VoiceError('voice_config_unavailable'); }
    const config = snapshot?.config ?? snapshot?.parsed;
    if (!config || typeof config !== 'object') throw new VoiceError('voice_config_unavailable');
    let policy;
    try { policy = checkVoiceConfig(config); }
    catch (error) { throw error instanceof VoiceError ? error : new VoiceError('voice_config_unavailable'); }
    let catalog;
    try { catalog = await this.rpc('talk.catalog'); }
    catch { throw new VoiceError('provider_not_ready'); }
    if (catalog?.realtime?.ready !== true) throw new VoiceError('provider_not_ready');
    onProgress('voice-checks-passed');
    return policy;
  }
  create(onProgress) {
    if (this.creating || this.grant) return Promise.reject(new Error('Voice is already starting or active.'));
    const epoch = this.epoch;
    this.creating = true;
    this.pending = this.acquire(epoch, this.closing, onProgress);
    return this.pending;
  }
  async acquire(epoch, previousClose, onProgress = () => {}) {
    try {
      await previousClose;
      await this.preflight(stage => { if (epoch === this.epoch) onProgress(stage); });
      if (epoch !== this.epoch) throw new Error('Voice startup cancelled.');
      onProgress('reservation-started');
      let grant;
      try { grant = await this.rpc('talk.client.create', {
        sessionKey: this.sessionKey, provider: 'openai', model: MODEL, voice: this.voice,
        mode: 'realtime', transport: 'webrtc', brain: 'agent-consult', capabilities: ['gateway-control-v1'],
      }); } catch { throw new VoiceError('provider_session_failed'); }
      try {
        checkGrant(grant);
        if (epoch !== this.epoch) throw new Error('Voice startup cancelled.');
      } catch (error) {
        if (grant?.voiceSessionId) await this.closeGrant(grant);
        throw error;
      }
      this.grant = grant;
      onProgress('provider-reserved');
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
