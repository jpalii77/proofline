// Round-18 accuracy error (eval/verdicts-r18.json, 15 Oct), a fifth fresh list: 32 of 33 kept claims right.
// The one wrong claim: "no website of its own" for Teknofish Elektronik. Its site is teknofish.com: the address
// leaves out "Elektronik", the title is a slogan ("Güvenli Alışverişin Adresi"), and only the page's schema.org
// data names "Teknofish Elektronik". Discovery search returned a map listing only.
// Fixes: the schema.org Organization name counts as the page naming itself; the name-built guess also tries the
// name without a trailing word for what the shop sells, kept only when the page names the whole business exactly.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck, shortDomains } from '../src/checks.mjs';
import { orgNames } from '../src/text.mjs';

const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const TEKNO = `<html lang="tr"><head><title>Güvenli Alışverişin Adresi</title><meta property="og:site_name" content="Güvenli Alışverişin Adresi">${ld({ '@context': 'https://schema.org/', '@type': 'Organization', name: 'TEKNOFİSH', legalName: 'Teknofish Elektronik', url: 'https://www.teknofish.com' })}</head><body><p>Telefon, televizyon, küçük ev aletleri. Ücretsiz kargo, 3 taksit.</p></body></html>`;

function fakeIO({ pages = {}, results = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b !== undefined ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: [] }; },
    async search(q, { purpose } = {}) { return purpose === 'discover' ? { results } : { results: [] }; },
  };
}
const listing = [{ url: 'https://yandex.com.tr/maps/org/teknofish/161171440269', title: 'Teknofish', content: 'Teknofish Elektronik, elektronik mağazası' }];

test('schema.org names: Organization and store names, @graph too; products, websites and broken blocks are skipped', () => {
  assert.deepEqual(orgNames(TEKNO), ['TEKNOFİSH', 'Teknofish Elektronik']);
  const graph = ld({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'Ana Sayfa' }, { '@type': ['OnlineStore'], name: 'Lahza Butik' }] });
  assert.deepEqual(orgNames(graph), ['Lahza Butik']);
  assert.deepEqual(orgNames(ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Kulaklık', brand: { '@type': 'Brand', name: 'Sony' } })), []);
  assert.deepEqual(orgNames('<script type="application/ld+json">{"@context": broken</script>'), []);
  assert.deepEqual(orgNames('<script>var x = {"name": "Not a schema block"}</script>'), []);
});

test('the shortened guess drops only a trailing word for what the shop sells, and only leaves a 7+ letter word', () => {
  assert.deepEqual(shortDomains('Teknofish Elektronik'), ['teknofish.com', 'teknofish.com.tr']);
  assert.deepEqual(shortDomains('Mardini Kozmetik'), ['mardini.com', 'mardini.com.tr']);
  for (const name of ['Ceran Saat', 'Güneş Tıp Kitabevi', 'Ocean Marine', 'Teknofish', 'Elektronik Teknofish', 'Kuzucu Süt Ürünleri']) {
    assert.deepEqual(shortDomains(name), [], name);
  }
});

test('Teknofish Elektronik: teknofish.com, named only in its schema.org data, is found as its own website', async () => {
  const r = await runCheck(fakeIO({ pages: { 'https://teknofish.com/': TEKNO }, results: listing }), 'web.own_site_found', { name: 'Teknofish Elektronik' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'teknofish.com');
});

test('a shortened address whose page does not name the whole business is passed over, and "no website" still holds', async () => {
  // mardini.com is someone else: a "Mardini" law office, no "Mardini Kozmetik" anywhere
  const pages = { 'https://mardini.com/': '<html lang="tr"><head><title>Mardini Hukuk Bürosu</title></head><body><p>Avukatlık, İstanbul</p></body></html>' };
  const r = await runCheck(fakeIO({ pages, results: [{ url: 'https://www.instagram.com/mardinikozmetikbm/', title: 'Mardini Kozmetik', content: 'Mardini Kozmetik' }] }), 'web.own_site_found', { name: 'Mardini Kozmetik' });
  assert.equal(r.pass, false, r.summary);
  // with a city typed too, a loose match on the shortened address is still not enough
  const c = await runCheck(fakeIO({ pages: { 'https://mardini.com/': '<html lang="tr"><head><title>Mardini</title></head><body><p>Mardini, İstanbul</p></body></html>' }, results: [] }), 'web.own_site_found', { name: 'Mardini Kozmetik', city: 'İstanbul' });
  assert.notEqual(c.observed?.host, 'mardini.com', c.summary);
});

test('a page whose schema.org name is a different business does not become "theirs"', async () => {
  const other = TEKNO.replace(/Teknofish Elektronik/g, 'Teknoland Elektronik').replace('TEKNOFİSH', 'TEKNOLAND');
  const r = await runCheck(fakeIO({ pages: { 'https://teknofish.com/': other }, results: listing }), 'web.own_site_found', { name: 'Teknofish Elektronik' });
  assert.notEqual(r.pass, true, r.summary);
});
