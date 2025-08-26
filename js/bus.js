
// Simple Event Bus with history (for preflight)
export const bus = (() => {
  const handlers = new Map(); // event -> Set(callback)
  const history = [];
  const MAX_HISTORY = 100;

  function on(event, cb) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(cb);
    return () => off(event, cb);
  }
  function off(event, cb) {
    const set = handlers.get(event);
    if (set) set.delete(cb);
  }
  function emit(event, detail = {}) {
    const ts = new Date().toISOString();
    const rec = { event, ts, detail };
    history.push(rec);
    if (history.length > MAX_HISTORY) history.shift();
    const set = handlers.get(event);
    if (set) {
      set.forEach(cb => {
        try { cb(detail, event); } catch (err) { console.error('bus handler error', err); }
      });
    }
  }
  function getHistory() { return history.slice(-MAX_HISTORY); }
  return { on, off, emit, getHistory };
})();
