// Cloudflare Workers entry for the public Proofline demo (wrangler.jsonc).
// /api/* goes to the demo app (src/web/app.mjs); everything else is the static UI in public/.
// DemoState is a SQLite-backed Durable Object (available on the Workers free plan) that keeps the
// daily live-run counters, the 24-hour query cache and recent live runs, consistently across
// every Cloudflare location. It stores salted per-day IP hashes, never IPs.

import { DurableObject } from 'cloudflare:workers';
import { createWebApp } from '../src/web/app.mjs';
import { injectShareMeta, SHARE_ID, SHARE_MS } from '../src/web/share.mjs';
import { utcDay } from '../src/web/store.mjs';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

const DAYS_KEPT = 3 * 86400000;
const REPORTS_KEPT = 3000;

export class DemoState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS counts (k TEXT PRIMARY KEY, n INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, at INTEGER NOT NULL, events TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);`);
  }

  count(k) {
    const row = this.sql.exec('SELECT n FROM counts WHERE k = ?', k).toArray()[0];
    return row ? row.n : 0;
  }

  usage({ scope = 'run', ipHash }) {
    const day = utcDay();
    return { global: this.count(`${day}|${scope}|*`), ip: this.count(`${day}|${scope}|${ipHash}`) };
  }

  // A Durable Object handles one call at a time, so check-then-increment is atomic.
  take({ scope = 'run', ipHash, globalCap, ipCap }) {
    const day = utcDay();
    const g = `${day}|${scope}|*`;
    const i = `${day}|${scope}|${ipHash}`;
    if (this.count(g) >= globalCap) return { ok: false, reason: 'global', global: this.count(g), ip: this.count(i) };
    if (this.count(i) >= ipCap) return { ok: false, reason: 'ip', global: this.count(g), ip: this.count(i) };
    for (const k of [g, i]) this.sql.exec('INSERT INTO counts (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1', k);
    this.sql.exec('DELETE FROM counts WHERE k < ?', utcDay(Date.now() - DAYS_KEPT));
    return { ok: true, global: this.count(g), ip: this.count(i) };
  }

  getCache(k, maxAgeMs) {
    const row = this.sql.exec('SELECT at, events FROM cache WHERE k = ? AND at >= ?', k, Date.now() - maxAgeMs).toArray()[0];
    return row ? { at: row.at, events: JSON.parse(row.events) } : null;
  }

  putCache(k, events) {
    this.sql.exec('INSERT OR REPLACE INTO cache (k, at, events) VALUES (?, ?, ?)', k, Date.now(), JSON.stringify(events));
    this.sql.exec('DELETE FROM cache WHERE at < ?', Date.now() - DAYS_KEPT);
  }

  putRun(id, data) {
    this.sql.exec('INSERT OR REPLACE INTO runs (id, at, data) VALUES (?, ?, ?)', id, Date.now(), JSON.stringify(data));
    this.sql.exec('DELETE FROM runs WHERE at < ?', Date.now() - DAYS_KEPT);
  }

  getRun(id, maxAgeMs) {
    const row = this.sql.exec('SELECT data FROM runs WHERE id = ? AND at >= ?', id, Date.now() - maxAgeMs).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  // Shared reports (/r/<id>): kept SHARE_DAYS, and at most REPORTS_KEPT rows (oldest go first).
  putReport(id, record) {
    this.sql.exec('INSERT OR REPLACE INTO reports (id, at, data) VALUES (?, ?, ?)', id, Date.now(), JSON.stringify(record));
    this.sql.exec('DELETE FROM reports WHERE at < ?', Date.now() - SHARE_MS);
    this.sql.exec('DELETE FROM reports WHERE id NOT IN (SELECT id FROM reports ORDER BY at DESC LIMIT ?)', REPORTS_KEPT);
  }

  getReport(id, maxAgeMs) {
    const row = this.sql.exec('SELECT data FROM reports WHERE id = ? AND at >= ?', id, Date.now() - maxAgeMs).toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
}

function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/** /r/<id>: the same page, with the shared report's name in the title and link-preview tags. */
async function sharePage(request, env, store, id) {
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
  const html = await page.text();
  let record = null;
  try { record = SHARE_ID.test(id) ? await store.getReport(id, SHARE_MS) : null; } catch { /* page shows the expired note */ }
  return new Response(injectShareMeta(html, record), {
    status: record ? 200 : 404,
    headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const store = env.DEMO_STATE.get(env.DEMO_STATE.idFromName('global'));
      const url = new URL(request.url);
      const share = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
      if (share && request.method === 'GET') return await sharePage(request, env, store, share[1]);
      const app = createWebApp({ env, store, pace: true });
      const res = await app(request, ctx);
      if (res) return withHeaders(res, { 'x-content-type-options': 'nosniff' });
      return withHeaders(await env.ASSETS.fetch(request), SECURITY_HEADERS);
    } catch {
      return new Response(JSON.stringify({ error: 'The demo host is busy. Try again in a minute.' }), {
        status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30' },
      });
    }
  },
};
