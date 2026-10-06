// Wraps an I/O object so every call is memoised and logged for the trace.
// The agent's gather phase and the gate each get their own wrapper: the gate never reuses
// what the gather phase saw, it observes again.

export function observed(io, onCall = () => {}) {
  const memo = new Map();
  const wrap = (name) => async (...args) => {
    const key = `${name}:${JSON.stringify(args)}`;
    if (memo.has(key)) return memo.get(key);
    const started = Date.now();
    const p = io[name](...args);
    memo.set(key, p);
    const out = await p;
    onCall({ tool: name, args, ms: Date.now() - started, error: out?.error || null });
    return out;
  };
  return {
    mode: io.mode,
    dnsLookup: wrap('dnsLookup'),
    fetchPage: wrap('fetchPage'),
    tlsCert: wrap('tlsCert'),
    nominatim: wrap('nominatim'),
    search: wrap('search'),
  };
}
