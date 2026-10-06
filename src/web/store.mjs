// Demo state: daily live-run quotas, a 24-hour cache of identical live queries, and recent live runs
// (so "Re-run proof" works on any server instance). Two implementations with the same async API:
//   createMemoryStore()  in-process (tests, local Node)
//   DemoState            Durable Object with SQLite (Cloudflare Workers, see worker/index.mjs)
// IPs are never stored: callers pass a salted, per-day hash.

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function createMemoryStore({ now = () => Date.now() } = {}) {
  const counts = new Map();
  const cache = new Map();
  const runs = new Map();
  const get = (k) => counts.get(k) || 0;
  return {
    async usage({ scope = 'run', ipHash }) {
      const day = utcDay(now());
      return { global: get(`${day}|${scope}|*`), ip: get(`${day}|${scope}|${ipHash}`) };
    },
    async take({ scope = 'run', ipHash, globalCap, ipCap }) {
      const day = utcDay(now());
      const g = `${day}|${scope}|*`;
      const i = `${day}|${scope}|${ipHash}`;
      if (get(g) >= globalCap) return { ok: false, reason: 'global', global: get(g), ip: get(i) };
      if (get(i) >= ipCap) return { ok: false, reason: 'ip', global: get(g), ip: get(i) };
      counts.set(g, get(g) + 1);
      counts.set(i, get(i) + 1);
      return { ok: true, global: get(g), ip: get(i) };
    },
    async getCache(key, maxAgeMs) {
      const row = cache.get(key);
      return row && now() - row.at <= maxAgeMs ? row : null;
    },
    async putCache(key, events) {
      cache.set(key, { at: now(), events });
    },
    async putRun(id, data) {
      runs.set(id, { at: now(), data });
      if (runs.size > 200) runs.delete(runs.keys().next().value);
    },
    async getRun(id, maxAgeMs) {
      const row = runs.get(id);
      return row && now() - row.at <= maxAgeMs ? row.data : null;
    },
  };
}
