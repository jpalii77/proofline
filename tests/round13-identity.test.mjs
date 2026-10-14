// Round-13 accuracy error (eval/verdicts-r13.json, 14 Oct): for the bare, common name "MK Collection" the
// name-built guess found mkcollection.com.tr, a Turkish protocol-gift business that happens to own the address
// (2 wrong claims). A Turkish page is no help there. For a bare name made only of common words or initials, an
// address that no search result ties to the business now also needs to link to the business's own listing
// found in search (its Instagram or Shopier page); a distinctive name (Lahza, Perfumum, Naramica) needs nothing more.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distinctiveName, runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html lang="tr"><head><title>${title}</title></head><body>${body}</body></html>`;

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

const MK_RESULTS = [
  { url: 'https://www.shopier.com/mkcollectionbutik', title: 'MK Collection - Shopier', content: 'MK Collection kadın giyim' },
  { url: 'https://www.instagram.com/mkcollection.butik/', title: 'MK Collection (@mkcollection.butik)', content: 'MK Collection' },
];
const GIFTS = html('MKCollection | Premium Protocol Gifts & Collectible Pieces', '<p>Kurumsal protokol hediyeleri, ₺</p><a href="https://instagram.com/mkcollectiontr">Instagram</a>');

test('which names are distinctive enough on their own', () => {
  for (const n of ['Lahza Butik', 'D&P Perfumum', 'Naramica', 'Bebetto', 'Hilal AV Market', 'Ebru Elbise']) assert.equal(distinctiveName(n), true, n);
  for (const n of ['MK Collection', 'Style Me Shop', 'Moda Store', 'Gold Fashion']) assert.equal(distinctiveName(n), false, n);
});

test('common bare name: a Turkish site at the name-built address that does not link to the business is a namesake (mkcollection.com.tr)', async () => {
  const r = await runCheck(fakeIO({ pages: { 'https://mkcollection.com.tr/': GIFTS }, results: MK_RESULTS }), 'web.own_site_found', { name: 'MK Collection' });
  assert.notEqual(r.pass, true, r.summary);
  assert.notEqual(r.observed?.host, 'mkcollection.com.tr');
});

test('common bare name: the same address counts when it links to the Instagram or Shopier page found in search', async () => {
  const own = html('MK Collection | Kadın Giyim', '<p>Yeni sezon ₺</p><a href="https://www.instagram.com/mkcollection.butik/">Instagram</a>');
  const r = await runCheck(fakeIO({ pages: { 'https://mkcollection.com.tr/': own }, results: MK_RESULTS }), 'web.own_site_found', { name: 'MK Collection' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'mkcollection.com.tr');
  const shop = html('MK Collection', '<p>₺</p><a href="https://shopier.com/mkcollectionbutik">Shopier mağazamız</a>');
  const s = await runCheck(fakeIO({ pages: { 'https://mkcollection.com.tr/': shop }, results: MK_RESULTS }), 'web.own_site_found', { name: 'MK Collection' });
  assert.equal(s.pass, true, s.summary);
});

test('distinctive bare name: unchanged, the name-built address still counts (lahzaabutik.com)', async () => {
  const results = [{ url: 'https://www.facebook.com/p/LAHZA-BUTIK-1', title: 'LAHZA BUTİK', content: 'Lahza Butik' }];
  const r = await runCheck(fakeIO({ pages: { 'https://lahzaabutik.com/': html('Lahza - Kadın Modası', '<p>Lahza Butik</p>') }, results }), 'web.own_site_found', { name: 'Lahza Butik' });
  assert.equal(r.pass, true, r.summary);
});
