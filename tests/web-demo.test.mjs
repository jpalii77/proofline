// The public demo app (Cloudflare Workers handler) on Node: sample by default, live search capped
// per day and per visitor, identical queries cached, keys never sent to the browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { createWebApp, demoConfig, MESSAGES } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';

const KEYS = { NEBIUS_API_KEY: 'test-nebius-not-real', TAVILY_API_KEY: 'test-tavily-not-real' };
const req = (path, ip = '203.0.113.7', init = {}) => new Request(`https://demo.test${path}`, { ...init, headers: { 'cf-connecting-ip': ip, ...(init.headers || {}) } });

async function events(res) {
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map((block) => {
    const type = /^event: (.*)$/m.exec(block)?.[1];
    return { type, ...JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || '{}') };
  });
}

// "Live" wiring backed by the Lumen recording, counting how often the model is asked to plan.
function fakeLive() {
  const sample = loadSamples().find((s) => s.id === 'lumen');
  let plans = 0;
  const wireLive = () => {
    const brain = createSampleBrain(sample);
    const plan = brain.plan;
    brain.plan = (a) => { plans++; return plan(a); };
    return { io: createSampleIO(sample), brain };
  };
  return { wireLive, plans: () => plans };
}

test('without keys: samples work, live search says it is not configured', async () => {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  const cfg = await (await app(req('/api/config'))).json();
  assert.equal(cfg.demo.live, false);
  assert.equal(cfg.samples.length, 4);
  for (const s of cfg.samples) {
    const ev = await events(await app(req(`/api/run?q=${encodeURIComponent(s.input)}`)));
    assert.ok(ev.find((e) => e.type === 'done'), s.id);
  }
  const live = await events(await app(req('/api/run?q=sakal%20kafe%20ankara&live=1')));
  assert.deepEqual(live.map((e) => e.type), ['error']);
  assert.equal(live[0].message, MESSAGES.notConfigured);
});

test('recorded mode refuses unknown businesses with a pointer to live search', async () => {
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false });
  const ev = await events(await app(req('/api/run?q=some%20real%20shop')));
  assert.equal(ev[0].message, MESSAGES.notSample);
});

test('config never exposes keys', async () => {
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false });
  const body = await (await app(req('/api/config'))).text();
  assert.ok(!body.includes('test-nebius') && !body.includes('test-tavily'));
  const cfg = JSON.parse(body);
  assert.equal(cfg.demo.live, true);
  assert.deepEqual(cfg.demo.limits, { perDay: 20, perVisitor: 3, cacheHours: 24 });
  assert.equal(cfg.demo.left, 3);
});

test('per-visitor cap, then the global cap; cached queries are free', async () => {
  const live = fakeLive();
  const env = { ...KEYS, LIVE_GLOBAL_PER_DAY: '4', LIVE_IP_PER_DAY: '3' };
  const app = createWebApp({ env, store: createMemoryStore(), pace: false, wireLive: live.wireLive });
  const run = async (q, ip) => events(await app(req(`/api/run?live=1&q=${encodeURIComponent(q)}`, ip)));

  for (const q of ['shop one', 'shop two', 'shop three']) assert.ok((await run(q, '198.51.100.1')).find((e) => e.type === 'done'), q);
  assert.equal(live.plans(), 3);
  const capped = await run('shop four', '198.51.100.1');
  assert.equal(capped[0].message, MESSAGES.ipQuota);

  // Same query again (different case and spacing): served from cache, no model call, no quota.
  const again = await run('  Shop ONE ', '198.51.100.1');
  assert.equal(again[0].type, 'cached');
  assert.ok(again.find((e) => e.type === 'done'));
  assert.equal(live.plans(), 3);

  assert.ok((await run('shop five', '198.51.100.2')).find((e) => e.type === 'done'));
  const global = await run('shop six', '198.51.100.3');
  assert.equal(global[0].message, MESSAGES.globalQuota);
  assert.match(global[0].message, /live quota used up today — try a recorded example/i);
  assert.equal(live.plans(), 4);
});

test('caps reset the next UTC day', async () => {
  let t = Date.parse('2026-10-20T23:59:00Z');
  const now = () => t;
  const live = fakeLive();
  const app = createWebApp({ env: { ...KEYS, LIVE_IP_PER_DAY: '1' }, store: createMemoryStore({ now }), now, pace: false, wireLive: live.wireLive });
  const run = async (q) => events(await app(req(`/api/run?live=1&q=${q}`)));
  assert.ok((await run('a')).find((e) => e.type === 'done'));
  assert.equal((await run('b'))[0].message, MESSAGES.ipQuota);
  t += 120000;
  assert.ok((await run('b')).find((e) => e.type === 'done'));
});

test('re-run proof works for sample runs and live runs', async () => {
  const live = fakeLive();
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false, wireLive: live.wireLive });
  for (const path of ['/api/run?q=Lumen%20Coffee%20Roasters', '/api/run?live=1&q=lumen%20live']) {
    const ev = await events(await app(req(path)));
    const runId = ev.find((e) => e.type === 'run').runId;
    const claim = ev.find((e) => e.type === 'done').report.verified[0];
    const res = await app(req('/api/recheck', undefined, { method: 'POST', body: JSON.stringify({ runId, claimId: claim.id }) }));
    assert.equal(res.status, 200, path);
    assert.equal((await res.json()).verdict, 'verified');
  }
  const gone = await app(req('/api/recheck', undefined, { method: 'POST', body: JSON.stringify({ runId: 'l.nope', claimId: 'x' }) }));
  assert.equal(gone.status, 404);
});

test('limits come from the environment', () => {
  const c = demoConfig({ LIVE_GLOBAL_PER_DAY: '5', LIVE_IP_PER_DAY: '1', LIVE_CACHE_HOURS: '6', LIVE_REQUEST_BUDGET: 'x' });
  assert.equal(c.globalPerDay, 5);
  assert.equal(c.ipPerDay, 1);
  assert.equal(c.cacheHours, 6);
  assert.equal(c.requestBudget, 40);
  assert.equal(demoConfig({ ...KEYS, LIVE_ENABLED: 'false' }).liveReady, false);
});
