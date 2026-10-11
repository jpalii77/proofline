// Round-4 accuracy errors (docs/accuracy.md, 12 Oct, 12 online shops queried by bare name only): a bare
// common name took foreign namesakes ("Shout" -> shout-tv.com and a place in Massachusetts, "Loky" -> lokyai.com
// and a village in Madagascar); hilalavmarket.com was missed, so Hilal AV Market was told it has no website; a
// page title that is the address itself ("erenhobi.com") read as a rename; "Ankara Pet" on the map was taken
// for "Pet Ankara".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelIsName, runCheck } from '../src/checks.mjs';

const html = (title, body = '', head = '') => `<html><head><title>${title}</title>${head}</head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [], map = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { error: 'ECONNREFUSED' }; },
    async nominatim(q) { return { results: typeof map === 'function' ? map(q) : map }; },
    async search(q, { purpose } = {}) { return purpose === 'closure' ? { results: [] } : { results }; },
  };
}

const SHOUT_TV = html('Shout! TV', '<p>Stream classic movies and TV.</p>', '<meta property="og:site_name" content="Shout! TV">');
const LOKY_AI = html('Loky AI - The Unified Agentic Data Infrastructure', '<h1>Loky AI</h1>');

test('bare name: a site whose name only contains the typed name is a possible namesake, not "theirs"', async () => {
  for (const [host, name, page] of [['shout-tv.com', 'Shout', SHOUT_TV], ['lokyai.com', 'Loky', LOKY_AI]]) {
    const r = await runCheck(fakeIO({ pages: { [`https://${host}/`]: page } }), 'site.own_site', { host, name });
    assert.equal(r.pass, null, `${host}: ${r.summary}`);
    assert.match(r.summary, /namesake/);
  }
});

test('bare name: a site that names exactly the business still counts', async () => {
  const page = html('SHOUT – Oversize Giyim, Unisex Stil ve Sokak Modası');
  const r = await runCheck(fakeIO({ pages: { 'https://shout.com.tr/': page } }), 'site.own_site', { host: 'shout.com.tr', name: 'Shout' });
  assert.equal(r.pass, true, r.summary);
  const naramica = html('Naramica', '<p>El yapımı seramik</p>');
  const r2 = await runCheck(fakeIO({ pages: { 'https://naramica.com/': naramica } }), 'site.own_site', { host: 'naramica.com', name: 'Naramica' });
  assert.equal(r2.pass, true, r2.summary);
});

test('bare name: with a city given, the old rules apply (a containing title plus the city)', async () => {
  const page = html('Shout! TV Ankara', '<p>Ankara</p>');
  const r = await runCheck(fakeIO({ pages: { 'https://shout-tv.com/': page } }), 'site.own_site', { host: 'shout-tv.com', name: 'Shout', city: 'Ankara' });
  assert.equal(r.pass, true, r.summary);
});

test('own site found: the address that is exactly the name counts, even when the page title says something else', async () => {
  const results = [{ title: 'Hilal AV Market - Yandex Maps', url: 'https://yandex.com/maps/org/hilal_av_market/98928845506', content: 'Hilal AV Market, av malzemeleri' }];
  const page = html('Av Tüfekleri I Kamp &amp; Outdoor I Orion Arms&amp;Miras Silah San.', '<a href="/sepet">Sepet</a>');
  const r = await runCheck(fakeIO({ results, pages: { 'https://hilalavmarket.com/': page } }), 'web.own_site_found', { name: 'Hilal AV Market' });
  assert.equal(r.pass, true, r.summary);
  assert.match(r.summary, /hilalavmarket\.com/);
});

test('labelIsName: the whole name written as one word, long enough not to be a common word', () => {
  assert.equal(labelIsName('hilalavmarket.com', 'Hilal AV Market'), true);
  assert.equal(labelIsName('www.erenhobi.com', 'Eren Hobi'), true);
  assert.equal(labelIsName('kampveotesi.com', 'Kamp ve Ötesi'), true);
  assert.equal(labelIsName('shout.com.tr', 'Shout'), false, 'too short to tell from a namesake');
  assert.equal(labelIsName('shout-tv.com', 'Shout'), false);
  assert.equal(labelIsName('hilalav.com.tr', 'Hilal AV Market'), false);
});

test('name match: a page title that is the address itself names the business ("erenhobi.com")', async () => {
  const r = await runCheck(fakeIO({ pages: { 'https://erenhobi.com/': html('erenhobi.com') } }), 'page.name_match', { url: 'https://erenhobi.com/', name: 'Eren Hobi' });
  assert.equal(r.pass, true, r.summary);
  const r2 = await runCheck(fakeIO({ pages: { 'https://x.com/': html('Erenhobi | Drone') } }), 'page.name_match', { url: 'https://x.com/', name: 'Eren Hobi' });
  assert.equal(r2.pass, true, r2.summary);
  const other = await runCheck(fakeIO({ pages: { 'https://x.com/': html('Atlas Bisiklet') } }), 'page.name_match', { url: 'https://x.com/', name: 'Eren Hobi' });
  assert.equal(other.pass, false, 'another name is still a mismatch');
});

test('map: with no city, a place found by name alone is not tied to the business', async () => {
  const map = [{ name: 'Shout', display_name: 'Shout, Sandwich, Barnstable County, Massachusetts, United States', lat: '41.7', lon: '-70.4' }];
  const r = await runCheck(fakeIO({ map }), 'osm.listed', { name: 'Shout' });
  assert.equal(r.pass, null, r.summary);
  const none = await runCheck(fakeIO({ map: [] }), 'osm.listed', { name: 'Shout' });
  assert.equal(none.pass, false, 'nothing by that name anywhere is still "not on the map"');
});

test('map: when the name holds the city, the words must keep their order ("Ankara Pet" is not "Pet Ankara")', async () => {
  const map = [{ name: 'Ankara Pet', display_name: 'Ankara Pet, Lizbon Caddesi, Ata Mahallesi, Çankaya, Ankara, Türkiye', kind: 'shop=pet' }];
  const r = await runCheck(fakeIO({ map }), 'osm.listed', { name: 'Pet Ankara', city: 'Ankara' });
  assert.notEqual(r.pass, true, r.summary);
  const same = [{ name: 'Pet Ankara', display_name: 'Pet Ankara, 1516. Cadde, Çankaya, Ankara, Türkiye', kind: 'shop=pet' }];
  const r2 = await runCheck(fakeIO({ map: same }), 'osm.listed', { name: 'Pet Ankara', city: 'Ankara' });
  assert.equal(r2.pass, true, r2.summary);
  const plain = [{ name: 'Risus Wedding', display_name: 'Risus Wedding, Turgut Özal Bulvarı, Gölbaşı, Ankara' }];
  const r3 = await runCheck(fakeIO({ map: plain }), 'osm.listed', { name: 'Risus Wedding', city: 'Ankara' });
  assert.equal(r3.pass, true, 'a name without the city word is matched as before');
});

test('bare name: a for-sale page at the address built from the name is not the business\'s site', async () => {
  for (const title of ['osepetshop.com for sale | Spaceship.com', 'Domain for sale']) {
    const r = await runCheck(fakeIO({ pages: { 'https://osepetshop.com/': html(title) } }), 'site.own_site', { host: 'osepetshop.com', name: 'Osepet Shop' });
    assert.notEqual(r.pass, true, `${title}: ${r.summary}`);
  }
});

test('map: with no city, a name of two distinctive words found on the map still counts', async () => {
  const map = [{ name: 'Hicret Kuruyemiş', display_name: 'Hicret Kuruyemiş, Kocaeli, Türkiye' }];
  assert.equal((await runCheck(fakeIO({ map }), 'osm.listed', { name: 'Hicret Kuruyemiş' })).pass, true);
});

test('planner: a bare one-word name narrowed to one particular business is a guess between namesakes (round 5)', async () => {
  const { narrowsBareName } = await import('../src/agent/pipeline.mjs');
  assert.equal(narrowsBareName({ name: 'Shout' }, 'Shout Outdoor Media'), true);
  assert.equal(narrowsBareName({ name: 'Shout' }, 'SHOUT'), false, 'same name, other spelling');
  assert.equal(narrowsBareName({ name: 'Shout' }, 'Shout Mağaza'), false, 'generic words add nothing');
  assert.equal(narrowsBareName({ name: 'Shout', city: 'İstanbul' }, 'Shout Outdoor Media'), false, 'a city was given');
  assert.equal(narrowsBareName({ name: 'Kaptan Oyuncak' }, 'Kaptan Oyuncak Dünyası'), false, 'two distinctive words are specific enough');
});
