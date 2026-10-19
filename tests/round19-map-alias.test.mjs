// Round 19's last wrong claim (eval/verdicts-r19.json), the known limit of round 3: Yöresel Bakkal was told it
// is missing from OpenStreetMap, but its Bostanlı store is on the map as "Tereci", the brand its own site links
// (its Instagram account). Fix: before "not on the map", the other names the business's own site goes by are
// looked up too, in the city the user typed; a place found there leaves the claim not settled.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClaim } from '../src/claims.mjs';
import { ownSiteAliases, runCheck } from '../src/checks.mjs';

const SITE = 'https://yoreselbakkal.com.tr/';
const HOME = `<html lang="tr"><head><title>Yöresel Bakkal | Doğal ve Yöresel Ürünler</title></head><body>
<p>Köy peyniri, zeytinyağı, tarhana. Mavişehir, Soğukkuyu, Alaybey ve Bostanlı mağazalarımız her gün açık.</p>
<a href="https://www.instagram.com/tereci_izmir/">Instagram</a> <a href="https://www.facebook.com/sharer.php?u=x">Paylaş</a></body></html>`;
const TERECI = { name: 'Tereci', display_name: 'Tereci, Şehitler Bulvarı, Bostanlı, Karşıyaka, İzmir, Türkiye', lat: '38.46', lon: '27.09', kind: 'shop=deli' };

function fakeIO({ pages = { [SITE]: HOME }, map = (q) => (/^tereci, İzmir$/.test(q) ? [TERECI] : []) } = {}) {
  const lookups = [];
  return {
    mode: 'test',
    lookups,
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async nominatim(q) { lookups.push(q); return { results: map(q) }; },
    async search() { return { results: [] }; },
  };
}

test('other names a site goes by: its linked accounts, without words the name or city already hold', () => {
  assert.deepEqual(ownSiteAliases({ html: HOME }, 'Yöresel Bakkal', { place: 'İzmir' }), ['tereci']);
  assert.deepEqual(ownSiteAliases({ html: '<a href="https://instagram.com/yoreselbakkal">x</a>' }, 'Yöresel Bakkal'), [], 'a handle that is the name itself adds nothing');
  const og = '<meta property="og:site_name" content="Tereci Yöresel Bakkal">';
  assert.deepEqual(ownSiteAliases({ html: og }, 'Yöresel Bakkal'), ['tereci']);
});

test('Yöresel Bakkal: on the map as “Tereci” in İzmir, so “not on the map” is not settled', async () => {
  const io = fakeIO();
  const r = await runCheck(io, 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(r.pass, null, r.summary);
  assert.match(r.summary, /Tereci/);
  assert.equal(r.observed.alias, 'tereci');
});

test('the claim carries the domain, and nothing else changes without one', async () => {
  const c = buildClaim('not_on_map', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(c.claim.proof[0].params.domain, 'yoreselbakkal.com.tr');
  assert.equal(buildClaim('not_on_map', { name: 'Yöresel Bakkal', city: 'İzmir' }).claim.proof[0].params.domain, undefined);
  const r = await runCheck(fakeIO(), 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir' });
  assert.equal(r.pass, false, 'no own site: still "not on the map"');
});

test('the alias must be found in the typed city, in Turkey, under a matching name', async () => {
  const elsewhere = { ...TERECI, display_name: 'Tereci, Kordon, Bodrum, Muğla, Türkiye' };
  const far = await runCheck(fakeIO({ map: (q) => (/tereci/i.test(q) ? [elsewhere] : []) }), 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(far.pass, false, far.summary);
  const other = { ...TERECI, name: 'Terzi Ahmet', display_name: 'Terzi Ahmet, Bostanlı, Karşıyaka, İzmir, Türkiye' };
  const unlike = await runCheck(fakeIO({ map: (q) => (/tereci/i.test(q) ? [other] : []) }), 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(unlike.pass, false, unlike.summary);
});

test('a guessed city or a site that does not load keeps the old answer, with no extra map lookups', async () => {
  const guessed = fakeIO();
  const g = await runCheck(guessed, 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir', cityGuessed: true, domain: 'yoreselbakkal.com.tr' });
  assert.equal(g.pass, false);
  assert.ok(!guessed.lookups.some((q) => /tereci/i.test(q)));
  const down = fakeIO({ pages: {} });
  const d = await runCheck(down, 'osm.listed', { name: 'Yöresel Bakkal', city: 'İzmir', domain: 'yoreselbakkal.com.tr' });
  assert.equal(d.pass, false);
  assert.ok(!down.lookups.some((q) => /tereci/i.test(q)));
});
