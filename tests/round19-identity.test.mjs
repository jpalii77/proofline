// Round-19 accuracy errors (eval/verdicts-r19.json, 16 Oct), a sixth fresh list: 27 of 30 kept claims right.
// 1) Fiyord Balık Av Market was told it has no website; its shop is balikavmarket.net, an address without
//    "Fiyord" that search did not return, but its Yandex Maps entry (a search result) links it.
// 2) Yöresel Bakkal was told "a public page says it may have closed": Apple Maps calls one Tereci Yöresel
//    Bakkal branch "Permanently Closed", while its own site sells and lists four İzmir stores open every day.
// 3) (known limit, not fixed) "missing from OpenStreetMap": its Bostanlı store is on the map as "Tereci".
// Fixes: before "no website", the business's listings in the results are read for the website they link,
// which must still pass the identity test; a closure phrase is not settled while the business's own site is up.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClaim } from '../src/claims.mjs';
import { runCheck } from '../src/checks.mjs';
import { listedWebsites } from '../src/text.mjs';

const Y = 'https://yandex.com.tr/maps/org/fiyord_balik_av_malzemeleri/244652776217';
const YANDEX = `<html><head><title>Fiyord Balık &amp; AV Malzemeleri, Antalya</title></head><body>
<div class="business-urls-view__url"><a itemProp="url" class="business-urls-view__link" href="http://balikavmarket.net/" target="_blank" rel="nofollow">balikavmarket.net</a></div>
<a href="https://yandex.com.tr/maps/">Haritalar</a>
<script>window.__s = {"socialLinks":[{"type":"instagram","href":"https://www.instagram.com/fiyordantalyaavmarket"}],"urls":["http://balikavmarket.net/","https://www.balikavmarket.net/iletisim2"]};</script>
</body></html>`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const FIYORD = `<html lang="tr-TR"><head><title>Fiyord Balık Av Market Balıkçılık Mağazası</title><meta property="og:site_name" content="Fiyord Balık Av Market Balıkçılık Mağazası">${ld({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Fiyord Balık', legalName: 'Fiyord Balık Av Market' })}</head><body><p>Olta, makine, suni yem. Ücretsiz kargo.</p></body></html>`;

function fakeIO({ pages = {}, results = [], again = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b !== undefined ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: [] }; },
    async search(q, { purpose } = {}) { return purpose === 'discover' ? { results } : purpose === 'closure' ? { results: again } : { results: [] }; },
  };
}
const listing = [{ url: Y, title: 'Fiyord Balık Av Market - Yandex Haritalar', content: 'Fiyord Balık Av Market, balık av malzemeleri, Konyaaltı, Antalya' }];

test('the website a listing links: itemprop="url" links and "urls" / "website" fields, hosts only, once each', () => {
  assert.deepEqual(listedWebsites(YANDEX), ['balikavmarket.net']);
  assert.deepEqual(listedWebsites('<script>{"website":"https://www.shop.example/"}</script>'), ['shop.example']);
  assert.deepEqual(listedWebsites('<a href="https://elsewhere.example/">x</a>'), [], 'an ordinary link is not the business website');
});

test('Fiyord: its map listing links balikavmarket.net, which is found as its own website', async () => {
  const r = await runCheck(fakeIO({ pages: { [Y]: YANDEX, 'https://balikavmarket.net/': FIYORD }, results: listing }), 'web.own_site_found', { name: 'Fiyord Balık Av Market' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'balikavmarket.net');
  assert.equal(r.observed.via, 'listing link');
});

test('a listing that links a site naming someone else does not make that site theirs', async () => {
  const other = FIYORD.replace(/Fiyord Balık Av Market/g, 'Deniz Av Market').replace('Fiyord Balık', 'Deniz Av');
  const r = await runCheck(fakeIO({ pages: { [Y]: YANDEX, 'https://balikavmarket.net/': other }, results: listing }), 'web.own_site_found', { name: 'Fiyord Balık Av Market' });
  assert.notEqual(r.pass, true, r.summary);
});

test('a linked site that only loosely matches leaves "no website" unsettled', async () => {
  const loose = '<html lang="tr"><head><title>Fiyord Balıkçılık</title></head><body><p>Fiyord Balıkçılık, Antalya. Olta ve yem.</p></body></html>';
  const r = await runCheck(fakeIO({ pages: { [Y]: YANDEX, 'https://balikavmarket.net/': loose }, results: listing }), 'web.own_site_found', { name: 'Fiyord Balık Av Market' });
  assert.notEqual(r.pass, false, r.summary);
});

test('a closure phrase is not settled while the business\'s own site is up with real content', async () => {
  const apple = [{ url: 'https://maps.apple.com/place?place-id=I3FBD3F5E7973B99F', title: 'Tereci Yoresel Bakkal in Cigli İzmir, Türkiye - Apple Maps', content: 'Permanently Closed' }];
  const site = `<html lang="tr"><head><title>Yöresel Bakkal | Yörelerinden Getirilen Doğal Lezzetler</title></head><body><p>${'Zeytinyağı, peynir, bal, tarhana ve yöresel ürünler. Mağazalarımız her gün 08:00-20:00 açık. '.repeat(5)}</p></body></html>`;
  const up = await runCheck(fakeIO({ again: apple, pages: { 'https://yoreselbakkal.com.tr/': site } }), 'web.no_closure_signal', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(up.pass, null, up.summary);
  // with no site of its own, or a site that is down, the phrase still counts
  const none = await runCheck(fakeIO({ again: apple }), 'web.no_closure_signal', { name: 'Yöresel Bakkal', city: 'İzmir' });
  assert.equal(none.pass, false, none.summary);
  const down = await runCheck(fakeIO({ again: apple }), 'web.no_closure_signal', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(down.pass, false, down.summary);
});

test('the closure claim passes the business\'s domain to its check', () => {
  const c = buildClaim('possibly_closed', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(c.claim.proof[0].params.domain, 'yoreselbakkal.com.tr');
  assert.equal(buildClaim('possibly_closed', { name: 'Yöresel Bakkal', city: 'İzmir' }).claim.proof[0].params.domain, undefined);
});
