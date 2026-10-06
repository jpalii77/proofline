// Live-mode failure paths: model timeouts and errors, the run's time limit and the host's request
// limits must degrade to "not checked" or "not written", never to a false claim or a 500.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { runCheck } from '../src/checks.mjs';
import { buildClaim, CLAIM_TYPES, gateClaim } from '../src/claims.mjs';
import { createRealIO } from '../src/io/real.mjs';
import { budgetFetch, createWorkerNet } from '../src/io/net-worker.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { DEADLINE_ERROR, friendlyError, isHostLimit, withDeadline } from '../src/limits.mjs';
import { createWebApp, demoConfig } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';

const samples = loadSamples();
const lumen = samples.find((s) => s.id === 'lumen');
const KEYS = { NEBIUS_API_KEY: 'test-nebius-not-real', TAVILY_API_KEY: 'test-tavily-not-real' };

function brainWith(sample, overrides) {
  const b = createSampleBrain(sample);
  return { ...b, ...overrides, models: { reasoning: 'nvidia/test-super', fast: 'nvidia/test-nano', provider: 'test' } };
}
const fail = (msg) => async () => { throw Object.assign(new Error(msg), { call: { model: 'nvidia/test-super', ms: 12, usage: null } }); };
const proven = (report) => report.verified.every((c) => c.evidence.every((e) => e.matched));

test('planner error: the run finishes from the query and search results, nothing unproven', async () => {
  for (const s of samples) {
    const { report } = await runAgent({ query: s.input, io: createSampleIO(s), brain: brainWith(s, { plan: fail('Token Factory HTTP 500: upstream') }) });
    assert.ok(report, s.id);
    assert.ok(proven(report), `${s.id}: every verified claim is proven`);
    assert.equal(report.models.calls[0].outcome, 'failed');
    assert.match(report.models.calls[0].detail, /HTTP 500/);
    assert.match(report.partial.join(' '), /Planner did not answer/);
  }
});

test('claim proposer error: only code-built claims reach the gate; still no false claims', async () => {
  const kuzey = samples.find((s) => s.id === 'kuzey');
  const { report } = await runAgent({ query: kuzey.input, io: createSampleIO(kuzey), brain: brainWith(kuzey, { propose: fail('Token Factory: no answer within 60 s') }) });
  assert.deepEqual(report.verified.map((c) => c.type), ['no_own_website'], 'the own-site guard still puts “no own website” to the gate');
  assert.equal(report.dropped.length, 0);
  assert.match(report.partial.join(' '), /Claim proposer did not answer/);
});

test('owner rewrite and writer errors: checked wording is kept, no pitch is invented', async () => {
  const { report } = await runAgent({
    query: lumen.input, io: createSampleIO(lumen),
    brain: brainWith(lumen, { verify: fail('Token Factory HTTP 429: busy'), write: async () => { throw new Error('model reply had no valid JSON'); } }),
  });
  assert.ok(report.verified.length > 0);
  for (const c of report.verified) assert.equal(c.ownerText, c.statement);
  assert.deepEqual(report.pitch.findings, []);
  assert.equal(report.pitch.opening, '');
  assert.equal(report.summary, '');
  assert.deepEqual(report.models.calls.map((c) => c.outcome), ['accepted', 'partial', 'failed', 'failed']);
  assert.equal(report.partial.length, 2);
});

test('a model call that hangs past the run time limit is cut off, the run still ends', async () => {
  const never = () => new Promise(() => {});
  const started = Date.now();
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: brainWith(lumen, { propose: never }), deadlineMs: 1500 });
  assert.ok(Date.now() - started < 4000, 'finished soon after the limit');
  const propose = report.models.calls.find((c) => c.stage === 'propose');
  assert.equal(propose.outcome, 'failed');
  assert.match(propose.detail, /run time limit/);
  const write = report.models.calls.find((c) => c.stage === 'write');
  assert.equal(write.skipped, true, 'no model call starts after the limit');
  assert.ok(proven(report));
});

test('after the run time limit every check answers “not checked”, and the gate drops every claim', async () => {
  let t = 0;
  const late = withDeadline(createSampleIO(lumen), 1, () => t);
  t = 5;
  assert.equal((await late.fetchPage('https://lumencoffee.example/')).error, DEADLINE_ERROR);
  const reach = await runCheck(late, 'http.reachable', { url: 'https://lumencoffee.example/' });
  assert.equal(reach.pass, null, 'a timed-out run is never “site is down”');
  const ctx = { name: lumen.name, city: lumen.city, domain: lumen.domain, phone: lumen.listedPhone, userGivenDomain: true, searchQuery: 'q' };
  for (const type of Object.keys(CLAIM_TYPES)) {
    const b = buildClaim(type, ctx, {});
    if (!b.ok) continue;
    const g = await gateClaim(late, b.claim);
    assert.equal(g.verdict, 'dropped', `${type} must not survive with nothing checked`);
  }
});

test('host request limits (budget, “Too many subrequests”) are “not checked”, never findings', async () => {
  assert.ok(isHostLimit('request budget for this run used up'));
  assert.ok(isHostLimit('Too many subrequests.'));
  assert.ok(isHostLimit(DEADLINE_ERROR));
  assert.ok(!isHostLimit('ECONNREFUSED'));
  assert.ok(!isHostLimit('timeout'));

  // Cloudflare refuses every further fetch: DNS, HTTP and TLS all become inconclusive.
  const refused = async () => { throw new Error('Too many subrequests.'); };
  const io = createRealIO({ net: createWorkerNet({ fetchImpl: refused }), fetchImpl: refused });
  assert.equal((await runCheck(io, 'http.reachable', { url: 'https://shop.example.com/' })).pass, null);
  assert.equal((await runCheck(io, 'dns.resolves', { host: 'shop.example.com' })).pass, null);
  assert.equal((await runCheck(io, 'tls.cert_valid', { host: 'shop.example.com' })).pass, null);

  // Own-site identity: a candidate our host could not load is open, not “no own website”.
  const search = async () => ({ results: [{ title: 'Corner Shop Izmir', url: 'https://cornershop.com.tr/hakkimizda', content: 'Corner Shop, Izmir' }] });
  const budget = budgetFetch(async () => new Response('x'), 0);
  const io2 = { ...createRealIO({ net: createWorkerNet({ fetchImpl: budget }), fetchImpl: budget }), search };
  const own = await runCheck(io2, 'web.own_site_found', { name: 'Corner Shop', city: 'Izmir', query: 'q' });
  assert.equal(own.pass, null);
  assert.match(own.summary, /Not checked/);
});

test('a search that throws does not crash the run', async () => {
  const io = { ...createSampleIO(lumen), search: async () => { throw new Error('socket hang up'); } };
  const { report } = await runAgent({ query: lumen.input, io, brain: createSampleBrain(lumen) });
  assert.ok(report);
  assert.match(report.partial.join(' '), /Web search failed/);
  assert.ok(proven(report));
});

test('the demo app answers host failures with a plain sentence and 503, never a 500', async () => {
  const broken = { ...createMemoryStore(), usage: async () => { throw new Error('Too many subrequests.'); } };
  const app = createWebApp({ env: KEYS, store: broken, pace: false });
  const res = await app(new Request('https://demo.test/api/config'));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /request limit/);
  assert.ok(!/at .*\.mjs/.test(body.error), 'no stack trace');
  assert.match(friendlyError(new Error('Token Factory HTTP 429: slow down')), /busy/);
  assert.match(friendlyError(new Error('weird')), /Something went wrong/);
});

test('live runs carry the run time limit; a partial live run is shown but not cached', async () => {
  assert.equal(demoConfig({}).runSeconds, 90);
  assert.equal(demoConfig({ LIVE_RUN_SECONDS: '45' }).runSeconds, 45);
  let plans = 0;
  const wireLive = () => {
    const brain = brainWith(lumen, { write: fail('Token Factory HTTP 503') });
    const plan = brain.plan;
    brain.plan = (a) => { plans++; return plan(a); };
    return { io: createSampleIO(lumen), brain };
  };
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false, wireLive });
  const run = async () => (await (await app(new Request('https://demo.test/api/run?live=1&q=lumen%20partial', { headers: { 'cf-connecting-ip': '198.51.100.9' } }))).text());
  const first = await run();
  assert.match(first, /event: done/);
  assert.match(first, /Writer did not answer/);
  await run();
  assert.equal(plans, 2, 'the second identical query ran again instead of replaying a partial run');
});
