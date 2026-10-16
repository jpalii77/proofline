// Audit of 15 Oct 2026, findings 10-17 (after audit-1015.test.mjs and audit-1015b.test.mjs):
// 10) one person rotating addresses in one network could use up the whole day's live searches
// 11) every replay of a recorded example wrote a new shared report, which could push real reports out
// 12) no other site was kept from showing the demo inside its own page (frame-ancestors, x-frame-options)
// 14) without IP_SALT the visitor hashes used a salt anyone can read in the source
// 15) the local server listened on every network interface (now 127.0.0.1 unless HOST says otherwise)
// 16) a certificate refused for no stated reason was called "not trusted"; an unreadable date could
//     throw out of the TLS socket callback
// 17) a ?q=…&live=1 link started a paid live search without a click
// (13, the self-test: it spends no paid quota, uses no keys and is capped per visitor; left as is.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';
import { readConfig } from '../src/runtime.mjs';
import { createWebApp, demoConfig, MESSAGES, netPrefix } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';
import { createServer } from '../server.mjs';

const parse = (text) => text.split('\n\n').filter(Boolean).map((block) => ({ type: /^event: (.*)$/m.exec(block)?.[1], ...JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || '{}') }));
const KEYS = { NEBIUS_API_KEY: 'test-nebius', TAVILY_API_KEY: 'test-tavily' };
const offline = async () => { throw new TypeError('fetch failed'); };

// 10 ────────────────────────────────────────────────────────────────────────────────────────────

test('the network of an address: IPv4 /24, IPv6 /48, shortened IPv6 written out first', () => {
  assert.equal(netPrefix('203.0.113.9'), '203.0.113');
  assert.equal(netPrefix('2001:db8:5:1::7'), '2001:db8:5');
  assert.equal(netPrefix('2001:db8::1'), '2001:db8:0');
  assert.equal(netPrefix('2001:0db8:0005:0001:0:0:0:7'), '2001:db8:5');
  assert.equal(netPrefix('local'), 'local');
});

test('rotating addresses in one network stops at the network cap; another network still gets its searches', async () => {
  const app = createWebApp({ env: { ...KEYS, LIVE_NET_PER_DAY: '2', LIVE_IP_PER_DAY: '3' }, store: createMemoryStore(), pace: false, fetchImpl: offline });
  const run = async (ip, q) => parse(await (await app(new Request(`https://demo.test/api/run?live=1&q=${q}`, { headers: { 'cf-connecting-ip': ip } }))).text());
  for (const [ip, q] of [['198.51.100.1', 'shop-a.example.com'], ['198.51.100.2', 'shop-b.example.com']]) {
    assert.ok(!(await run(ip, q)).some((e) => e.type === 'error' && e.message === MESSAGES.ipQuota), `${ip} is within the cap`);
  }
  const third = await run('198.51.100.3', 'shop-c.example.com');
  assert.ok(third.some((e) => e.type === 'error' && e.message === MESSAGES.ipQuota), 'a third address in the same /24 is refused');
  const other = await run('192.0.2.50', 'shop-d.example.com');
  assert.ok(!other.some((e) => e.type === 'error' && e.message === MESSAGES.ipQuota), 'another network is not affected');
});

// 11 ────────────────────────────────────────────────────────────────────────────────────────────

test('replaying a recorded example reuses one shared link per example, language and day', async () => {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  const shareId = async (q, lang) => parse(await (await app(new Request(`https://demo.test/api/run?q=${encodeURIComponent(q)}&lang=${lang}`, { headers: { 'cf-connecting-ip': '203.0.113.9' } }))).text()).find((e) => e.type === 'share')?.id;
  const a = await shareId('Lumen Coffee Roasters, Izmir', 'en');
  const b = await shareId('Lumen Coffee Roasters, Izmir', 'en');
  const tr = await shareId('Lumen Coffee Roasters, Izmir', 'tr');
  const other = await shareId('Harbor Dental Studio, Kadıköy', 'en');
  assert.match(a, /^[a-z0-9]{12}$/);
  assert.equal(a, b, 'the same example in the same language keeps its link');
  assert.notEqual(a, tr, 'Turkish gets its own link');
  assert.notEqual(a, other, 'each example has its own link');
  const page = await app(new Request(`https://demo.test/api/report/${a}`));
  assert.equal(page.status, 200, 'the link opens');
});

// 12, 15 ────────────────────────────────────────────────────────────────────────────────────────

test('the local server refuses to be framed and serves on this machine', async () => {
  const server = createServer(readConfig({ SAMPLE_MODE: 'true' }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally { server.close(); }
  const src = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(src, /process\.env\.HOST \|\| '127\.0\.0\.1'/);
  const worker = fs.readFileSync(new URL('../worker/index.mjs', import.meta.url), 'utf8');
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /'x-frame-options': 'DENY'/);
});

// 14 ────────────────────────────────────────────────────────────────────────────────────────────

test('without IP_SALT the salt comes from a secret the host holds, never the public default', () => {
  assert.notEqual(demoConfig(KEYS).salt, 'proofline-demo');
  assert.notEqual(demoConfig({ ...KEYS, NEBIUS_API_KEY: 'other' }).salt, demoConfig(KEYS).salt);
  assert.equal(demoConfig({ ...KEYS, IP_SALT: 'set' }).salt, 'set');
});

// 16 ────────────────────────────────────────────────────────────────────────────────────────────

test('a refused certificate is "not trusted" only with a stated reason', async () => {
  const io = (r) => ({ async tlsCert() { return r; } });
  const noReason = await runCheck(io({ validTo: null, authorized: false, authorizationError: null }), 'tls.cert_valid', { host: 'shop.example' });
  assert.equal(noReason.pass, null, noReason.summary);
  const reason = await runCheck(io({ validTo: null, authorized: false, authorizationError: 'CERT_HAS_EXPIRED' }), 'tls.cert_valid', { host: 'shop.example' });
  assert.equal(reason.pass, false, reason.summary);
});

test('an unreadable certificate date becomes "no date" in the Node adapter, not a thrown error', () => {
  const src = fs.readFileSync(new URL('../src/io/net-node.mjs', import.meta.url), 'utf8');
  assert.match(src, /Number\.isFinite\(end\) \? new Date\(end\)\.toISOString\(\) : null/);
  assert.doesNotMatch(src, /new Date\(c\.valid_to\)\.toISOString\(\)/);
});

// 17 ────────────────────────────────────────────────────────────────────────────────────────────

test('a link with live=1 fills in the search but waits for a click; recorded links still open', () => {
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(q\) \{ \$\('#q'\)\.value = q; if \(liveLink\) \$\('#go'\)\.focus\(\); else start\(q\); \}/);
});
