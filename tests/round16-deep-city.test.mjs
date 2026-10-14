// Round-16 lost finding (eval/verdicts-r16.json, 14 Oct): PatiBurda, typed with Ankara. Its own site
// patiburda.com was never reported: the 1.4 MB homepage names Ankara once, at about 1.2 MB, past the
// 400 KB we read, and its contact page does not name the city at all. A cut-off homepage is now read
// once more, further down (up to 2 MB), for the typed city alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';
import { createRealIO } from '../src/io/real.mjs';

const html = (title, body = '', lang = '') => `<html${lang ? ` lang="${lang}"` : ''}><head><title>${title}</title></head><body>${body}</body></html>`;

// home: what the first read sees (cut off); deep: what a deeper read sees, or { to, body } if it ends elsewhere
function fakeIO({ home, deep, pages = {} }) {
  const calls = [];
  return {
    calls,
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url, opts = {}) {
      calls.push({ url, ...opts });
      if (url === 'https://patiburda.com/') {
        if (!opts.maxBytes) return { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: home, truncated: true };
        if (deep === undefined) return { status: null, finalUrl: url, chain: [], error: 'timeout' };
        if (typeof deep === 'string') return { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: deep };
        return { status: 200, finalUrl: deep.to, chain: [{ url, status: 301 }, { url: deep.to, status: 200 }], body: deep.body };
      }
      const p = pages[url];
      if (p === undefined) return { status: null, finalUrl: url, chain: [], error: 'ECONNREFUSED' };
      return { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: p };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: [] }; },
    async search() { return { results: [] }; },
  };
}

const head = '<meta property="og:site_name" content="PatiBurda"><a href="/pages/contact-us">İletişim</a><p>Kedi ve köpek mamaları</p>';
const home = html('PatiBurda', head, 'tr');
const contact = html('İletişim – PatiBurda', '<p>Bize yazın, 7/24 destek</p>', 'tr');
const input = { host: 'patiburda.com', name: 'PatiBurda', city: 'Ankara', query: 'PatiBurda Ankara' };

test('a city named only deep in a cut-off homepage is found by reading it again further down (PatiBurda, Ankara)', async () => {
  const deep = html('PatiBurda', `${head}${'<div>ürün</div>'.repeat(50)}<p>Mağazalarımız İstanbul ve Ankara'da</p>`, 'tr');
  const io = fakeIO({ home, deep, pages: { 'https://patiburda.com/pages/contact-us': contact } });
  const r = await runCheck(io, 'site.own_site', input);
  assert.equal(r.pass, true, r.summary);
  assert.match(r.summary, /ankara/i);
  assert.ok(io.calls.some((c) => c.maxBytes === 2_000_000), 'the deeper read asks for at most 2 MB');
});

test('the contact page is still tried first; when it names the city, no deeper read is made', async () => {
  const io = fakeIO({ home, deep: html('x', 'Ankara'), pages: { 'https://patiburda.com/pages/contact-us': html('İletişim', 'Adres: Çankaya, Ankara', 'tr') } });
  const r = await runCheck(io, 'site.own_site', input);
  assert.equal(r.pass, true, r.summary);
  assert.match(r.summary, /contact page/);
  assert.ok(!io.calls.some((c) => c.maxBytes), 'no deeper read');
});

test('a deeper read that still does not name the city leaves the answer "not settled"', async () => {
  const io = fakeIO({ home, deep: html('PatiBurda', `${head}<p>Tüm Türkiye'ye kargo</p>`, 'tr'), pages: { 'https://patiburda.com/pages/contact-us': contact } });
  const r = await runCheck(io, 'site.own_site', input);
  assert.equal(r.pass, null, r.summary);
});

test('a deeper read that ends on another site does not count', async () => {
  const io = fakeIO({ home, deep: { to: 'https://othershop.com/', body: html('Other', 'Ankara') }, pages: { 'https://patiburda.com/pages/contact-us': contact } });
  const r = await runCheck(io, 'site.own_site', input);
  assert.equal(r.pass, null, r.summary);
});

test('a deeper read that fails leaves the answer "not settled", never a finding', async () => {
  const io = fakeIO({ home, deep: undefined, pages: { 'https://patiburda.com/pages/contact-us': contact } });
  const r = await runCheck(io, 'site.own_site', input);
  assert.equal(r.pass, null, r.summary);
});

test('a homepage read in full (not cut off) is never read again', async () => {
  const io = fakeIO({ home, deep: html('x', 'Ankara') });
  const whole = { ...io, async fetchPage(url, opts = {}) { const r = await io.fetchPage(url, opts); return { ...r, truncated: undefined }; } };
  const r = await runCheck(whole, 'site.own_site', input);
  assert.equal(r.pass, null, r.summary);
  assert.ok(!io.calls.some((c) => c.maxBytes), 'no deeper read');
});

test('the live reader honours a larger read but never past 2 MB', async () => {
  const big = 'a'.repeat(3_000_000);
  const net = { kind: 'test', async lookup() { return ['93.184.216.34']; } };
  const fetchImpl = async () => new Response(big, { status: 200, headers: { 'content-type': 'text/html' } });
  const io = createRealIO({ net, fetchImpl });
  const normal = await io.fetchPage('https://example.com/');
  assert.equal(normal.truncated, true);
  assert.ok(normal.body.length <= 400_000);
  const deeper = await io.fetchPage('https://example.com/', { maxBytes: 1_500_000 });
  assert.ok(deeper.body.length > 400_000 && deeper.body.length <= 1_500_000);
  const capped = await io.fetchPage('https://example.com/', { maxBytes: 10_000_000 });
  assert.ok(capped.body.length <= 2_000_000);
  assert.equal(capped.truncated, true);
});
