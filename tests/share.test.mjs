// Shareable read-only report links (/r/<id>): stored on completion, public business data only,
// expire after SHARE_DAYS, safe link-preview tags. Demo app (Workers) and local Node server.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { readConfig } from '../src/runtime.mjs';
import { createWebApp } from '../src/web/app.mjs';
import { injectShareMeta, newShareId, SHARE_ID, shareRecord } from '../src/web/share.mjs';
import { createMemoryStore } from '../src/web/store.mjs';
import { createServer } from '../server.mjs';

const KEYS = { NEBIUS_API_KEY: 'test-nebius-not-real', TAVILY_API_KEY: 'test-tavily-not-real' };
const IP = '203.0.113.44';
const req = (path, init = {}) => new Request(`https://demo.test${path}`, { ...init, headers: { 'cf-connecting-ip': IP, ...(init.headers || {}) } });
const parse = (text) => text.split('\n\n').filter(Boolean).map((block) => ({ type: /^event: (.*)$/m.exec(block)?.[1], ...JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || '{}') }));
const lumen = loadSamples().find((s) => s.id === 'lumen');
const wireLive = () => ({ io: createSampleIO(lumen), brain: createSampleBrain(lumen) });

test('share ids are 12 random lowercase characters', () => {
  const ids = new Set(Array.from({ length: 200 }, newShareId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, SHARE_ID);
});

test('a finished sample run gets a read-only link that returns the same report', async () => {
  let t = Date.parse('2026-10-10T12:00:00Z');
  const now = () => t;
  const app = createWebApp({ env: {}, store: createMemoryStore({ now }), now, pace: false });
  const ev = parse(await (await app(req('/api/run?q=Lumen%20Coffee%20Roasters'))).text());
  const share = ev.find((e) => e.type === 'share');
  assert.ok(share, 'share event after done');
  assert.ok(ev.indexOf(share) > ev.findIndex((e) => e.type === 'done'));
  assert.match(share.path, /^\/r\/[a-z0-9]{12}$/);
  assert.equal(share.days, 14);

  const res = await app(req(`/api/report/${share.id}`));
  assert.equal(res.status, 200);
  const record = await res.json();
  assert.equal(record.id, share.id);
  assert.equal(record.mode, 'sample');
  assert.equal(record.at, t, 'generated-at timestamp');
  const done = record.events.find((e) => e.type === 'done');
  assert.deepEqual(done.report.verified.map((c) => c.id), ev.find((e) => e.type === 'done').report.verified.map((c) => c.id));
  assert.ok(record.events.find((e) => e.type === 'model'), 'model calls travel with the shared report');

  t += 15 * 86400000;
  const gone = await app(req(`/api/report/${share.id}`));
  assert.equal(gone.status, 404);
  assert.match((await gone.json()).error, /expired or does not exist/);
});

test('a shared live report holds no visitor data, and a cached replay gets its own link', async () => {
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false, wireLive });
  const first = parse(await (await app(req('/api/run?live=1&q=corner%20cafe%20izmir'))).text());
  assert.equal(typeof first.find((e) => e.type === 'run').left, 'number', 'the live page itself sees its quota');
  const rec = await (await app(req(first.find((e) => e.type === 'share').path.replace('/r/', '/api/report/')))).json();
  const blob = JSON.stringify(rec);
  assert.equal(rec.events.find((e) => e.type === 'run').left, undefined, 'quota is not shared');
  assert.ok(!blob.includes(IP) && !blob.includes('test-nebius') && !blob.includes('test-tavily'));
  assert.equal(rec.mode, 'live');

  const again = parse(await (await app(req('/api/run?live=1&q=Corner%20Cafe%20Izmir'))).text());
  assert.equal(again[0].type, 'cached');
  const share2 = again.find((e) => e.type === 'share');
  assert.ok(share2 && share2.id !== first.find((e) => e.type === 'share').id);
  const rec2 = await (await app(req(`/api/report/${share2.id}`))).json();
  assert.equal(rec2.events[0].type, 'cached');
});

test('bad or unknown ids are a 404 with a plain message', async () => {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  for (const id of ['nope', 'abcdefghijkl', 'abc%2F..%2Fx', 'ABCDEFGHIJKL']) {
    const res = await app(req(`/api/report/${id}`));
    assert.equal(res.status, 404, id);
  }
});

test('shareRecord refuses runs without a report and oversized ones', () => {
  assert.equal(shareRecord({ id: 'x', query: 'q', mode: 'live', events: [{ type: 'error', message: 'nope' }] }), null);
  const huge = [{ type: 'done', report: { blob: 'x'.repeat(1_600_000) } }];
  assert.equal(shareRecord({ id: 'x', query: 'q', mode: 'live', events: huge }), null);
});

test('link-preview tags name the business, escape it, and keep shared pages out of search', () => {
  const html = '<title>Proofline</title><meta name="description" content="d"><meta name="robots" content="index,follow"><meta property="og:title" content="t"><meta property="og:description" content="d"><meta name="twitter:title" content="t"><meta name="twitter:description" content="d">';
  const record = { events: [{ type: 'done', report: { ctx: { displayName: 'Evil <script>alert(1)</script> "Cafe"' }, card: { grade: 'C' }, stats: { verified: 3, dropped: 1 } } }] };
  const out = injectShareMeta(html, record);
  assert.ok(!out.includes('<script>'));
  assert.match(out, /<title>Evil &lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;Cafe&quot; — Proofline report<\/title>/);
  assert.match(out, /og:description" content="Digital health grade C: 3 claim\(s\) verified, 1 dropped by the proof gate/);
  assert.match(out, /name="robots" content="noindex"/);
  assert.match(injectShareMeta(html, null), /noindex/);
});

test('local Node server: share event, /r/<id> page and /api/report/<id>', async () => {
  const server = createServer({ ...readConfig({ SAMPLE_MODE: 'true' }), port: 0 }).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ev = parse(await fetch(`${base}/api/run?q=${encodeURIComponent('Atlas Bike Repair')}`).then((r) => r.text()));
    const share = ev.find((e) => e.type === 'share');
    assert.ok(share);
    const page = await fetch(`${base}${share.path}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<title>Atlas Bike Repair — Proofline report<\/title>/);
    assert.match(html, /id="shared-banner"/);
    const rec = await fetch(`${base}/api/report/${share.id}`).then((r) => r.json());
    assert.ok(rec.events.find((e) => e.type === 'done'));
    assert.equal((await fetch(`${base}/r/abcdefghijkl`)).status, 404);
    assert.equal((await fetch(`${base}/api/report/abcdefghijkl`)).status, 404);
  } finally {
    server.close();
  }
});
