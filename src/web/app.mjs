// Public demo app on web-standard Request/Response (runs on Cloudflare Workers; testable on Node).
//
//   GET  /api/config             demo setup: samples, whether live search is on, limits, what is left today
//   GET  /api/run?q=...          SSE trace of a recorded sample (free, unlimited)
//   GET  /api/run?q=...&live=1   SSE trace of a live run: cached for 24 h per query, else rate-limited
//   POST /api/recheck            { runId, claimId } -> re-runs that claim's proof right now
//   GET  /api/report/<id>        a finished run, stored for /r/<id> (read-only share link, 14 days)
//   GET  /api/selftest           network checks against fixed public test hosts (how this host behaves)
//
// Live runs spend a small trial credit, so they are capped per day (globally and per visitor) and
// identical queries are answered from cache. Keys come from the environment (Worker secrets) and
// never leave the server.

import { createNemotronBrain } from '../agent/nemotron-brain.mjs';
import { runAgent } from '../agent/pipeline.mjs';
import { createSampleBrain } from '../agent/sample-brain.mjs';
import { runCheck } from '../checks.mjs';
import { gateClaim } from '../claims.mjs';
import { budgetFetch, createWorkerNet } from '../io/net-worker.mjs';
import { observed } from '../io/observed.mjs';
import { createRealIO } from '../io/real.mjs';
import { createSampleIO, findSample, loadSamples } from '../io/sample.mjs';
import { friendlyError } from '../limits.mjs';
import { createTokenFactoryClient, DEFAULT_BASE_URL, DEFAULT_REASONING_MODEL } from '../llm.mjs';
import { createTavilyClient } from '../tavily.mjs';
import { fold } from '../text.mjs';
import { newShareId, SHARE_ID, SHARE_MS, shareRecord } from './share.mjs';

const HOUR = 3600000;

export const MESSAGES = {
  notConfigured: 'Live mode is not configured on this demo yet — try a recorded example.',
  globalQuota: 'Live quota used up today — try a recorded example. It resets at 00:00 UTC.',
  ipQuota: 'You have used your live checks for today — try a recorded example. They reset at 00:00 UTC.',
  notSample: 'Recorded mode knows four fictional businesses. Pick one of the examples, or switch to Live search.',
  empty: 'Enter a business name or a domain.',
  reportMissing: 'This report link has expired or does not exist. Shared reports are kept for 14 days.',
};

const int = (v, d) => (v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d);

/** Demo settings from Worker vars/secrets. Every limit is configurable. */
export function demoConfig(env = {}) {
  const has = (k) => !!String(env[k] ?? '').trim();
  return {
    liveReady: has('NEBIUS_API_KEY') && has('TAVILY_API_KEY') && String(env.LIVE_ENABLED ?? 'true') !== 'false',
    globalPerDay: int(env.LIVE_GLOBAL_PER_DAY, 20),
    ipPerDay: int(env.LIVE_IP_PER_DAY, 3),
    cacheHours: int(env.LIVE_CACHE_HOURS, 24),
    requestBudget: int(env.LIVE_REQUEST_BUDGET, 40),
    runSeconds: int(env.LIVE_RUN_SECONDS, 90),
    recheckGlobalPerDay: int(env.LIVE_RECHECK_GLOBAL_PER_DAY, 100),
    recheckIpPerDay: int(env.LIVE_RECHECK_IP_PER_DAY, 15),
    nebius: {
      apiKey: String(env.NEBIUS_API_KEY || '').trim(),
      baseUrl: env.NEBIUS_BASE_URL || DEFAULT_BASE_URL,
      reasoningModel: env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL,
      fastModel: env.NEBIUS_FAST_MODEL || '',
    },
    tavilyKey: String(env.TAVILY_API_KEY || '').trim(),
    nominatimContact: env.NOMINATIM_CONTACT || '',
    salt: env.IP_SALT || 'proofline-demo',
  };
}

async function ipHash(ip, salt, day) {
  const data = new TextEncoder().encode(`${day}|${ip}|${salt}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** A Server-Sent Events response plus a writer for it. */
function sseStream() {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = (e) => {
    if (!open) return;
    writer.write(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)).catch(() => { open = false; });
  };
  const close = () => { if (open) { open = false; writer.close().catch(() => {}); } };
  const response = new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
  return { send, close, response };
}

const rid = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

// wireLive: test hook that replaces the live I/O and model wiring.
export function createWebApp({ env = {}, store, fetchImpl = globalThis.fetch, pace = true, now = () => Date.now(), wireLive = null } = {}) {
  const cfg = demoConfig(env);
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const visitor = (request) => ipHash(request.headers.get('cf-connecting-ip') || 'local', cfg.salt, day());

  function liveWiring() {
    if (wireLive) return wireLive();
    const ioFetch = budgetFetch(fetchImpl, cfg.requestBudget);
    const llm = createTokenFactoryClient({ ...cfg.nebius, fetchImpl });
    const tavily = createTavilyClient({ apiKey: cfg.tavilyKey, fetchImpl });
    return {
      io: createRealIO({ net: createWorkerNet({ fetchImpl: ioFetch }), tavily, nominatimContact: cfg.nominatimContact, fetchImpl: ioFetch }),
      brain: createNemotronBrain(llm),
    };
  }

  async function config(request) {
    const used = cfg.liveReady ? await store.usage({ scope: 'run', ipHash: await visitor(request) }) : { global: 0, ip: 0 };
    return json({
      sampleMode: !cfg.liveReady,
      demo: {
        live: cfg.liveReady,
        limits: { perDay: cfg.globalPerDay, perVisitor: cfg.ipPerDay, cacheHours: cfg.cacheHours },
        left: cfg.liveReady ? Math.max(0, Math.min(cfg.globalPerDay - used.global, cfg.ipPerDay - used.ip)) : 0,
        host: 'Cloudflare Workers',
      },
      models: cfg.liveReady ? { reasoning: cfg.nebius.reasoningModel, fast: cfg.nebius.fastModel || cfg.nebius.reasoningModel } : null,
      tavily: cfg.liveReady,
      samples: loadSamples().map((s) => ({ id: s.id, input: s.input, blurb: s.blurb })),
    });
  }

  /** Stores a finished run for /r/<id> and tells the page its link. Never fails the run. */
  async function share(sse, { query, mode, events, at = now() }) {
    try {
      const id = newShareId();
      const record = shareRecord({ id, query, mode, events, at });
      if (!record) return;
      await store.putReport(id, record);
      sse.send({ type: 'share', id, path: `/r/${id}`, at: record.at, days: Math.round(SHARE_MS / 86400000) });
    } catch { /* sharing is optional; the report is already on screen */ }
  }

  function runSample(query, sse) {
    const sample = findSample(loadSamples(), query);
    if (!sample) { sse.send({ type: 'error', message: MESSAGES.notSample }); sse.close(); return null; }
    const runId = `s.${sample.id}.${rid('')}`;
    return (async () => {
      const events = [];
      const emit = (e) => { events.push(e); sse.send(e); };
      try {
        emit({ type: 'run', runId, mode: 'sample' });
        await runAgent({
          query: sample.input,
          io: createSampleIO(sample, { latency: pace ? [60, 240] : null }),
          brain: createSampleBrain(sample, { thinkMs: pace ? 650 : 0 }),
          emit,
        });
        await share(sse, { query: sample.input, mode: 'sample', events });
      } catch (err) {
        sse.send({ type: 'error', message: friendlyError(err) });
      } finally { sse.close(); }
    })();
  }

  async function runLive(request, query, sse) {
    const fail = (message) => { sse.send({ type: 'error', message }); sse.close(); };
    if (!cfg.liveReady) return fail(MESSAGES.notConfigured);
    const key = fold(query);
    if (!key) return fail(MESSAGES.empty);

    const hit = await store.getCache(key, cfg.cacheHours * HOUR);
    if (hit) {
      const cachedEvent = { type: 'cached', at: hit.at, ageMinutes: Math.round((now() - hit.at) / 60000) };
      sse.send(cachedEvent);
      for (const e of hit.events) sse.send(e);
      await share(sse, { query, mode: 'live', events: [cachedEvent, ...hit.events], at: hit.at });
      return sse.close();
    }

    const quota = await store.take({ scope: 'run', ipHash: await visitor(request), globalCap: cfg.globalPerDay, ipCap: cfg.ipPerDay });
    if (!quota.ok) return fail(quota.reason === 'global' ? MESSAGES.globalQuota : MESSAGES.ipQuota);

    const runId = rid('l.');
    const events = [];
    const emit = (e) => { events.push(e); sse.send(e); };
    try {
      emit({ type: 'run', runId, mode: 'live', left: Math.max(0, Math.min(cfg.globalPerDay - quota.global, cfg.ipPerDay - quota.ip)) });
      const { io, brain } = liveWiring();
      const out = await runAgent({ query, io, brain, emit, now, deadlineMs: cfg.runSeconds * 1000 });
      if (out.report) {
        await store.putRun(runId, { query, claims: [...out.report.verified, ...out.report.dropped].map(({ evidence, verdict, dropReason, ...plain }) => plain) }); // eslint-disable-line no-unused-vars
        // A run that lost a model step is shown, but not cached: the next visitor gets a fresh try.
        const blob = JSON.stringify(events);
        if (blob.length < 1_500_000 && !out.report.partial?.length) await store.putCache(key, events);
        await share(sse, { query, mode: 'live', events });
      }
    } catch (err) {
      sse.send({ type: 'error', message: friendlyError(err) });
    } finally { sse.close(); }
    return null;
  }

  async function recheck(request) {
    let input;
    try { input = JSON.parse((await request.text()).slice(0, 2000)); } catch { return json({ error: 'bad json' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'bad json' }, 400);
    const runId = String(input.runId || '');
    const claimId = String(input.claimId || '');
    let io;
    let claim;
    if (runId.startsWith('s.')) {
      // Samples are deterministic: replay the run without delays to get the same claims back.
      const sample = loadSamples().find((s) => s.id === runId.split('.')[1]);
      if (!sample) return json({ error: 'Run expired. Start a new check.' }, 404);
      const out = await runAgent({ query: sample.input, io: createSampleIO(sample), brain: createSampleBrain(sample) });
      const found = [...(out.report?.verified || []), ...(out.report?.dropped || [])].find((c) => c.id === claimId);
      if (found) { const { evidence, verdict, dropReason, ...plain } = found; claim = plain; } // eslint-disable-line no-unused-vars
      io = createSampleIO(sample);
    } else {
      if (!cfg.liveReady) return json({ error: MESSAGES.notConfigured }, 503);
      const run = await store.getRun(runId, cfg.cacheHours * HOUR);
      claim = run?.claims.find((c) => c.id === claimId);
      if (claim) {
        const quota = await store.take({ scope: 'recheck', ipHash: await visitor(request), globalCap: cfg.recheckGlobalPerDay, ipCap: cfg.recheckIpPerDay });
        if (!quota.ok) return json({ error: 'Re-check limit reached for today.' }, 429);
        io = liveWiring().io;
      }
    }
    if (!claim) return json({ error: 'Run expired. Start a new check.' }, 404);
    const again = await gateClaim(observed(io), claim);
    return json({ id: again.id, verdict: again.verdict, dropReason: again.dropReason, evidence: again.evidence, checkedAt: again.checkedAt });
  }

  // Host self-test: the network checks against a fixed list of public test hosts (no user input,
  // no API keys, no model calls), so anyone can see how DNS / HTTP / TLS behave on this host.
  const SELFTEST = [
    ['dns.resolves', { host: 'example.com' }],
    ['dns.resolves', { host: 'proofline-selftest-does-not-exist.example.com' }],
    ['http.reachable', { url: 'https://example.com/' }],
    ['http.https_redirect', { host: 'github.com' }],
    ['tls.cert_valid', { host: 'example.com', minDays: 1 }],
    ['tls.cert_valid', { host: 'expired.badssl.com' }],
    ['tls.cert_valid', { host: 'self-signed.badssl.com' }],
    ['tls.cert_valid', { host: 'wrong.host.badssl.com' }],
  ];
  async function selftest(request) {
    const quota = await store.take({ scope: 'selftest', ipHash: await visitor(request), globalCap: 200, ipCap: 10 });
    if (!quota.ok) return json({ error: 'Self-test limit reached for today.' }, 429);
    const ioFetch = budgetFetch(fetchImpl, 40);
    const io = createRealIO({ net: createWorkerNet({ fetchImpl: ioFetch }), fetchImpl: ioFetch });
    const results = [];
    for (const [check, params] of SELFTEST) {
      const r = await runCheck(io, check, params);
      results.push({ check, params, pass: r.pass, summary: r.summary });
    }
    return json({ host: io.host, requests: ioFetch.used(), results });
  }

  /** Handles /api/*; returns null for anything else (static assets). */
  return async function handle(request, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return null;
    try {
      if (request.method === 'GET' && url.pathname === '/api/config') return await config(request);
      if (request.method === 'GET' && url.pathname === '/api/run') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
        const live = url.searchParams.get('live') === '1';
        const sse = sseStream();
        let work;
        if (!q) { sse.send({ type: 'error', message: MESSAGES.empty }); sse.close(); } else work = live ? runLive(request, q, sse) : runSample(q, sse);
        if (work && ctx?.waitUntil) ctx.waitUntil(work);
        return sse.response;
      }
      if (request.method === 'POST' && url.pathname === '/api/recheck') return await recheck(request);
      if (request.method === 'GET' && url.pathname === '/api/selftest') return await selftest(request);
      const rep = /^\/api\/report\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && rep) {
        const record = SHARE_ID.test(rep[1]) ? await store.getReport(rep[1], SHARE_MS) : null;
        return record ? json(record) : json({ error: MESSAGES.reportMissing }, 404);
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      // Host limits and outages get a plain sentence and a retryable status, never a bare 500.
      return json({ error: friendlyError(err) }, 503);
    }
  };
}
