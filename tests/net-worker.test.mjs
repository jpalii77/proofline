// The Cloudflare Workers network adapter, against a fake network: DNS-over-HTTPS answers,
// TLS trust from the fetch handshake, expiry from Certificate Transparency, request budget.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';
import { budgetFetch, createWorkerNet, pickIssuance } from '../src/io/net-worker.mjs';
import { createRealIO } from '../src/io/real.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const DAY = 86400000;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();

function fakeNet({ dns = {}, https = {}, ct = {} } = {}) {
  return async (url) => {
    const u = new URL(String(url));
    if (u.hostname === 'cloudflare-dns.com') {
      const rec = dns[u.searchParams.get('name')];
      const type = u.searchParams.get('type');
      if (!rec) return json({ Status: 3 });
      return json({ Status: 0, Answer: (rec[type] || []).map((data) => ({ type: type === 'A' ? 1 : 28, data })) });
    }
    if (u.hostname === 'api.certspotter.com') return json(ct[u.searchParams.get('domain')] || []);
    const h = https[u.hostname];
    if (h instanceof Error) throw h;
    return new Response('<html><title>ok</title></html>', { status: h || 200, headers: { 'content-type': 'text/html' } });
  };
}

test('DNS over HTTPS: records, NXDOMAIN and no-data map to the same results as getaddrinfo', async () => {
  const net = createWorkerNet({ fetchImpl: fakeNet({ dns: { 'a.example': { A: ['93.184.216.34'], AAAA: [] }, 'empty.example': {} } }) });
  assert.deepEqual(await net.resolve('a.example'), { a: ['93.184.216.34'], aaaa: [] });
  assert.equal((await net.resolve('gone.example')).error, 'ENOTFOUND');
  assert.equal((await net.resolve('empty.example')).error, 'ENODATA');
  const io = createRealIO({ net, fetchImpl: fakeNet() });
  const r = await runCheck(io, 'dns.resolves', { host: 'gone.example' });
  assert.equal(r.pass, false);
});

test('SSRF guard works on Workers too: a host resolving to a private address is refused', async () => {
  const f = fakeNet({ dns: { 'evil.example': { A: ['127.0.0.1'] } } });
  const io = createRealIO({ net: createWorkerNet({ fetchImpl: f }), fetchImpl: f });
  const p = await io.fetchPage('https://evil.example/');
  assert.match(p.error, /private address/);
});

test('TLS on Workers: trust from the handshake, expiry from CT logs, source labelled', async () => {
  const ct = {
    'good.example': [
      { dns_names: ['good.example'], not_before: iso(-80), not_after: iso(10), revoked: false, issuer: { friendly_name: 'Old CA' } },
      { dns_names: ['*.example', 'good.example'], not_before: iso(-5), not_after: iso(85), revoked: false, issuer: { friendly_name: "Let's Encrypt" } },
      { dns_names: ['good.example'], not_before: iso(-1), not_after: iso(89), revoked: true, issuer: { friendly_name: 'Revoked CA' } },
    ],
  };
  const f = fakeNet({ dns: { 'good.example': { A: ['93.184.216.34'] }, 'bad.example': { A: ['93.184.216.35'] } }, ct, https: { 'bad.example': new TypeError('fetch failed', { cause: new Error('certificate has expired') }) } });
  const io = createRealIO({ net: createWorkerNet({ fetchImpl: f }), fetchImpl: f });
  const good = await runCheck(io, 'tls.cert_valid', { host: 'good.example', minDays: 30 });
  assert.equal(good.pass, true);
  assert.equal(good.observed.daysLeft, 84);
  assert.equal(good.observed.source, 'ct-log');
  assert.match(good.summary, /Certificate Transparency/);
  const bad = await runCheck(io, 'tls.cert_valid', { host: 'bad.example' });
  assert.equal(bad.pass, false);
  assert.match(bad.summary, /not trusted/);
});

test('CT issuance picker ignores revoked, expired and other-host certificates', () => {
  const rows = [
    { dns_names: ['other.example'], not_before: iso(-1), not_after: iso(50), revoked: false },
    { dns_names: ['x.example'], not_before: iso(-400), not_after: iso(-30), revoked: false },
    { dns_names: ['www.x.example', 'x.example'], not_before: iso(-3), not_after: iso(60), revoked: false },
  ];
  assert.equal(pickIssuance(rows, 'x.example').not_after, rows[2].not_after);
  assert.equal(pickIssuance(rows, 'y.example'), null);
});

test('request budget: calls beyond the limit fail clearly, checks turn inconclusive', async () => {
  const f = budgetFetch(fakeNet({ dns: { 'a.example': { A: ['93.184.216.34'] } } }), 1);
  const io = createRealIO({ net: createWorkerNet({ fetchImpl: f }), fetchImpl: f });
  await io.dnsLookup('a.example');
  const r = await runCheck(io, 'http.reachable', { url: 'https://a.example/' });
  assert.equal(r.pass, null, 'running out of requests is never "site down"');
  assert.match(r.summary, /budget/);
  assert.equal(f.used(), 1);
});
