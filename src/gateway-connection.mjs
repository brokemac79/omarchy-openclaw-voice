// The complete hello contains credentials. Retain only this private status projection.
const text = value => typeof value === 'string' && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
export function createConnectionStatus(now = Date.now) {
  let current = null;
  return {
    accept(hello) {
      current = {
        authMethod: text(hello?.auth?.method), role: text(hello?.auth?.role),
        scopes: Array.isArray(hello?.auth?.scopes) ? hello.auth.scopes.slice(0, 64).map(text).filter(Boolean) : [],
        serverVersion: text(hello?.server?.version), serverBuildId: text(hello?.server?.buildId),
        bootId: text(hello?.server?.bootId), connId: text(hello?.server?.connId), observedAtMs: now(),
      };
    },
    clear() { current = null; },
    get() { return current ? { ...current, scopes: [...current.scopes] } : null; },
  };
}
