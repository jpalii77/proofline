// Round-3 accuracy errors (docs/accuracy.md, 11 Oct, 12 new local businesses): a hotel whose site answers on
// http only was told it has no website (sunsetboutiquehotel.com); a map retry matched a clothes shop for a
// dental clinic (Santral); a hotel directory's subdomain (golden-boutique.ankarahotels.org) and another driving
// school ("Aysan Sürücü Kursu" for "A2 Sürücü Kursu") were taken for the business's own site.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foreignParent, kindMismatch, registrable, runCheck } from '../src/checks.mjs';
import { nameSimilarity } from '../src/text.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [], map = [] } = {}) {
  const fetched = [];
  return {
    fetched,
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      fetched.push(url);
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'SSL handshake failed' };
    },
    async tlsCert() { return { error: 'ECONNREFUSED' }; },
    async nominatim(q) { return { results: typeof map === 'function' ? map(q) : map } },
    async search(q, { purpose } = {}) { return purpose === 'closure' ? { results: [] } : { results }; },
  };
}

const SUNSET = html('Sunset Boutique Hotel &amp; Apartments - Cirali / Çıralı', '<p>Çıralı, Kemer, Antalya. Pansiyon and apartments by the beach.</p>');

test('own site: a site that answers on plain http only is still the business\'s site', async () => {
  const io = fakeIO({ pages: { 'http://sunsetboutiquehotel.com/': SUNSET } });
  const r = await runCheck(io, 'site.own_site', { host: 'sunsetboutiquehotel.com', name: 'Sunset Boutique Hotel', city: 'Antalya' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(io.fetched[0], 'https://sunsetboutiquehotel.com/', 'https first');
  assert.ok(io.fetched.indexOf('http://sunsetboutiquehotel.com/') > 0, 'then plain http');
});

test('own site found: the address built from the name is found over http (no more "no website" for Sunset)', async () => {
  const results = [{ title: 'Sunset Boutique Hotel - Booking', url: 'https://www.booking.com/hotel/tr/sunset-boutique.html', content: 'Sunset Boutique Hotel, Antalya' }];
  const io = fakeIO({ results, pages: { 'http://sunsetboutiquehotel.com/': SUNSET } });
  const r = await runCheck(io, 'web.own_site_found', { name: 'Sunset Boutique Hotel', city: 'Antalya' });
  assert.equal(r.pass, true, r.summary);
  assert.match(r.summary, /sunsetboutiquehotel\.com/);
});

test('own site: a page that fails on https and on http still does not count', async () => {
  const r = await runCheck(fakeIO(), 'site.own_site', { host: 'sunsetboutiquehotel.com', name: 'Sunset Boutique Hotel', city: 'Antalya' });
  assert.notEqual(r.pass, true);
});

test('own site: a subdomain of a site that does not carry the name is someone else\'s page', async () => {
  const page = html('Golden Boutique Hotel Ankara, Turkey', '<p>Golden Boutique Hotel, Gaziosmanpaşa, Ankara. Book now.</p>');
  const io = fakeIO({ pages: { 'https://golden-boutique.ankarahotels.org/': page } });
  const r = await runCheck(io, 'site.own_site', { host: 'golden-boutique.ankarahotels.org', name: 'Golden Boutique Hotel', city: 'Ankara' });
  assert.equal(r.pass, false);
  assert.match(r.summary, /page on ankarahotels\.org/);
  assert.equal(foreignParent('golden-boutique.ankarahotels.org', 'Golden Boutique Hotel'), 'ankarahotels.org');
});

test('own site: the business\'s own subdomains and www are not someone else\'s page', () => {
  assert.equal(foreignParent('www.lumencoffee.com', 'Lumen Coffee'), null);
  assert.equal(foreignParent('shop.lumencoffee.com', 'Lumen Coffee'), null);
  assert.equal(foreignParent('lumencoffee.com.tr', 'Lumen Coffee'), null);
  assert.equal(foreignParent('randevu.dentikonya.com.tr', 'Dent-i Konya'), null);
  assert.equal(registrable('a.b.example.com.tr'), 'example.com.tr');
  assert.equal(registrable('golden-boutique.ankarahotels.org'), 'ankarahotels.org');
  assert.equal(registrable('example.com'), 'example.com');
});

test('names: shared trade words do not make two different businesses one', () => {
  assert.ok(nameSimilarity('A2 Sürücü Kursu', 'Aysan Sürücü Kursu') < 0.5, 'A2 is not Aysan');
  assert.ok(nameSimilarity('Golden Boutique Hotel', 'Silver Boutique Hotel') < 0.5);
  // the same business still matches, with or without its trade words
  assert.ok(nameSimilarity('A2 Sürücü Kursu', 'A2 Sürücü Kursu Ankara') >= 0.5);
  assert.ok(nameSimilarity('Sunset Boutique Hotel', 'Sunset Boutique Hotel & Apartments') >= 0.5);
  assert.ok(nameSimilarity('Sakal Kafe Pub', 'Sakal Pub') >= 0.45);
  assert.equal(nameSimilarity('Kaptan Oyuncak', 'Kaptan Oyuncak'), 1);
});

test('own site: another driving school\'s site is not A2 Sürücü Kursu\'s', async () => {
  const page = html('Aysan Sürücü Kursu', '<p>Ankara ehliyet kursu. Keçiören</p>');
  const r = await runCheck(fakeIO({ pages: { 'https://aysansurucukursu.com/': page } }), 'site.own_site', { host: 'aysansurucukursu.com', name: 'A2 Sürücü Kursu', city: 'Ankara' });
  assert.notEqual(r.pass, true, r.summary);
});

test('map: a match of the wrong kind of place is not the business (Santral Ankara Diş vs a clothes shop)', async () => {
  const shop = { name: 'Santral', display_name: 'Santral, Bağcı Caddesi, Keçiören, Ankara', lat: '40', lon: '32', kind: 'shop=clothes' };
  const io = fakeIO({ map: (q) => (/^santral ankara,/i.test(q) ? [shop] : []) });
  const r = await runCheck(io, 'osm.listed', { name: 'Santral Ankara Diş', city: 'Ankara' });
  assert.equal(r.pass, false);
  assert.match(r.summary, /clothes \(shop=clothes\), not a clinic/);
});

test('map: the right kind of place still counts; a match with no kind recorded is judged by name as before', async () => {
  const pub = { name: 'Sakal Pub', display_name: 'Sakal Pub, Kavaklıdere, Çankaya, Ankara', lat: '39.9', lon: '32.8', kind: 'amenity=pub' };
  const io = fakeIO({ map: (q) => (/^sakal pub/i.test(q) ? [pub] : []) });
  assert.equal((await runCheck(io, 'osm.listed', { name: 'Sakal Kafe Pub', city: 'Ankara' })).pass, true);
  const clinic = { name: 'Dent-i Konya', display_name: 'Dent-i Konya, Selçuklu, Konya', lat: '37.9', lon: '32.5', kind: 'amenity=dentist' };
  assert.equal((await runCheck(fakeIO({ map: [clinic] }), 'osm.listed', { name: 'Dent-i Konya Ağız ve Diş', city: 'Konya' })).pass, true);
  const unknown = { name: 'Santral', display_name: 'Santral, Ankara', lat: '40', lon: '32' };
  assert.equal((await runCheck(fakeIO({ map: [unknown] }), 'osm.listed', { name: 'Santral Diş', city: 'Ankara' })).pass, true, 'no kind: same rule as before');
});

test('kindMismatch: only names with a trade word and a known kind are judged', () => {
  assert.equal(kindMismatch('Santral Ankara Diş', 'shop=clothes'), 'a clothes (shop=clothes), not a clinic');
  assert.equal(kindMismatch('Santral Ankara Diş', 'amenity=dentist'), null);
  assert.equal(kindMismatch('Sunset Boutique Hotel', 'tourism=guest_house'), null);
  assert.equal(kindMismatch('Risus Wedding', 'leisure=garden'), null, 'no trade word with a known kind');
  assert.equal(kindMismatch('Lumen Coffee Roasters', null), null);
});
