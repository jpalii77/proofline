// Round-1 accuracy errors (docs/accuracy.md): a namesake site accepted on the name alone (petpal.com),
// "no website" without trying the obvious address (naramica.com), and a map name with an extra word
// ("Sakal Kafe Pub" vs "Sakal Pub").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { obviousDomains, runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, search = {}, osm = {} } = {}) {
  const queries = [];
  return {
    queries,
    async fetchPage(url) { const p = pages[url]; return p ? { status: 200, chain: [], body: p } : { status: null, chain: [], error: 'ENOTFOUND' }; },
    async search(q, { purpose } = {}) { return search[purpose] || { results: [] }; },
    async nominatim(q) { queries.push(q); return osm[q] || { results: [] }; },
  };
}

const PETPAL_US = html('PetPal - Playfully Connecting People who LOVE Pets!', '<meta property="og:site_name" content="PetPal"><p>Join the community in Austin, Texas.</p>');
const petpalSearch = { discover: { results: [{ url: 'https://www.petpal.com', title: 'PetPal', content: 'Connecting people who love pets.' }] } };

test('own site: a namesake that never names the city is not settled', async () => {
  const io = fakeIO({ pages: { 'https://petpal.com/': PETPAL_US }, search: petpalSearch });
  const r = await runCheck(io, 'site.own_site', { host: 'petpal.com', name: 'Petpal', city: 'Bursa' });
  assert.equal(r.pass, null);
  assert.equal(r.observed.placeUnproven, true);
  assert.match(r.summary, /namesake/);
});

test('own site: the same site passes once the page names the city (either part of "Nilüfer, Bursa")', async () => {
  const page = html('Petpal Pet Shop', '<footer>Adres: Fethiye Mh., Nilüfer / Bursa</footer>');
  const io = fakeIO({ pages: { 'https://petpal.com/': page }, search: petpalSearch });
  for (const city of ['Bursa', 'Nilüfer, Bursa']) {
    const r = await runCheck(io, 'site.own_site', { host: 'petpal.com', name: 'Petpal', city });
    assert.equal(r.pass, true, city);
  }
});

test('own site: a search result showing the site and naming the city is a place tie too', async () => {
  const search = { discover: { results: [{ url: 'https://rehber.example/bursa/petpal', title: 'Petpal — Bursa', content: 'Petpal Bursa. Web: petpal.com.tr' }] } };
  const io = fakeIO({ pages: { 'https://petpal.com.tr/': html('Petpal') }, search });
  assert.equal((await runCheck(io, 'site.own_site', { host: 'petpal.com.tr', name: 'Petpal', city: 'Bursa' })).pass, true);
});

test('own site: without a city, the name rule is unchanged', async () => {
  const io = fakeIO({ pages: { 'https://petpal.com/': PETPAL_US }, search: petpalSearch });
  assert.equal((await runCheck(io, 'site.own_site', { host: 'petpal.com', name: 'Petpal' })).pass, true);
});

test('website search: a namesake is never turned into "no website of its own"', async () => {
  const io = fakeIO({ pages: { 'https://petpal.com/': PETPAL_US }, search: { discover: { results: [{ url: 'https://www.petpal.com/', title: 'PetPal', content: 'Pets' }] } } });
  const r = await runCheck(io, 'web.own_site_found', { name: 'Petpal', city: 'Bursa' });
  assert.equal(r.pass, null);
});

test('obvious address: built from the name, only for names long enough not to be a common word', () => {
  assert.deepEqual(obviousDomains('Naramica'), ['naramica.com', 'naramica.com.tr']);
  assert.deepEqual(obviousDomains('Kamp ve Ötesi'), ['kampveotesi.com', 'kampveotesi.com.tr']);
  assert.deepEqual(obviousDomains('Elle'), []);
  assert.deepEqual(obviousDomains('Petpal'), []);
});

test('website search: the obvious address is tried when search shows only Instagram', async () => {
  const search = { discover: { results: [{ url: 'https://www.instagram.com/naramica/', title: 'Naramica (@naramica)', content: 'Seramik' }] } };
  const io = fakeIO({ pages: { 'https://naramica.com/': html('Naramica | Seramik Ürünleri Keşfet') }, search });
  const r = await runCheck(io, 'web.own_site_found', { name: 'Naramica' });
  assert.equal(r.pass, true);
  assert.equal(r.observed.host, 'naramica.com');
  assert.match(r.summary, /address built from the name/);
});

test('website search: a guessed address that is someone else\'s, or does not load, is no evidence', async () => {
  const search = { discover: { results: [{ url: 'https://www.instagram.com/vatkalimon/', title: 'Vatkalimon', content: 'Moda' }] } };
  const other = fakeIO({ pages: { 'https://vatkalimon.com/': html('Domain for sale') }, search });
  const r1 = await runCheck(other, 'web.own_site_found', { name: 'Vatkalimon' });
  assert.equal(r1.pass, false);
  assert.ok(!r1.observed.tried.some((t) => t.guessed));
  const none = fakeIO({ search });
  assert.equal((await runCheck(none, 'web.own_site_found', { name: 'Vatkalimon' })).pass, false);
});

test('map: when the full name finds nothing, the name without generic words is tried once', async () => {
  const osm = { 'sakal pub, Ankara': { results: [{ name: 'Sakal Pub', display_name: 'Sakal Pub, Bestekar Sokağı, Kavaklıdere, Çankaya, Ankara, Türkiye', lat: '39.9', lon: '32.8' }] } };
  const io = fakeIO({ osm });
  const r = await runCheck(io, 'osm.listed', { name: 'Sakal Kafe Pub', city: 'Ankara' });
  assert.equal(r.pass, true);
  assert.deepEqual(io.queries, ['Sakal Kafe Pub, Ankara', 'sakal pub, Ankara']);
});

test('map: a name with no generic word is looked up once, and a miss is still "not on the map"', async () => {
  const io = fakeIO();
  const r = await runCheck(io, 'osm.listed', { name: 'Petpal', city: 'Bursa' });
  assert.equal(r.pass, false);
  assert.deepEqual(io.queries, ['Petpal, Bursa']);
});
