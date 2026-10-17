import { monotonicNow } from './readiness.mjs';

const valid = token => typeof token === 'string' && /^[a-f0-9]{16,32}$/.test(token);

// The UI must keep renewing a physical press. Release is input gating only;
// provider VAD still owns turn admission and replies keep playing.
export class HoldInput {
  constructor({ owner, canStart = () => true, now = monotonicNow, releaseBehavior = 'mute' }) {
    Object.assign(this, { owner, canStart, now, releaseBehavior });
    this.token = null; this.retired = new Map(); this.started = this.renewed = 0;
    this.message = '';
  }
  snapshot() {
    return { held: !!this.token, ready: !!this.token && this.owner.active && !this.owner.muteConfirmed,
      mode: this.owner.holdMode === true, message: this.message, releaseBehavior: this.releaseBehavior,
      remainingMs: this.token ? Math.max(0, 30000 - (this.now() - this.started)) : 0 };
  }
  retire(token) {
    for (const [old, until] of this.retired) if (until <= this.now()) this.retired.delete(old);
    if (this.retired.size >= 256 && !this.retired.has(token)) return false;
    this.retired.set(token, this.now() + 60000); return true;
  }
  press(token) {
    this.tick();
    if (!valid(token) || this.retired.has(token) || !this.retireCapacity()) return false;
    if (this.token === token) return true; // Key repeat cannot renew the lease.
    if (this.token) { this.release(this.token); this.retire(token); return false; }
    const owner = this.owner;
    if (!this.canStart() || owner.standby || owner.standbyStarting || (owner.requested && !owner.holdMode)
        || (!owner.requested && owner.reviewRequired)) { this.retire(token); return false; }
    this.token = token; this.started = this.renewed = this.now(); this.message = '';
    if (!owner.requested) void owner.start({ hold: true });
    this.tick(); owner.render(); return true;
  }
  retireCapacity() {
    for (const [old, until] of this.retired) if (until <= this.now()) this.retired.delete(old);
    return this.retired.size < 256;
  }
  renew(token) {
    this.tick();
    if (!valid(token) || this.token !== token) return false;
    this.renewed = this.now(); this.apply(); return true;
  }
  release(token, message = '') {
    if (!valid(token)) return false;
    this.retire(token); // Release-before-start wins even across independent IPC.
    if (this.token !== token) return true;
    this.token = null; this.message = message;
    this.owner.setHoldInput(token, false);
    if (!this.owner.active || this.releaseBehavior === 'end') void this.owner.stop();
    else this.owner.render();
    return true;
  }
  cancel() { if (this.token) this.release(this.token); }
  apply() { if (this.token && this.owner.active) this.owner.setHoldInput(this.token, true); }
  tick() {
    if (!this.token) return;
    if (!this.owner.requested || !this.owner.holdMode || !this.owner.gatewayConnected) {
      this.release(this.token); return;
    }
    if (this.now() - this.started >= 30000 || this.now() - this.renewed >= 600) {
      this.release(this.token, 'Hold ended for safety. Release and press again.'); return;
    }
    this.apply();
  }
}
