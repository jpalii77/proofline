// Round-12 accuracy errors (eval/verdicts-r12.json, 14 Oct), a fresh list after rounds 8-11: 13 wrong kept
// claims from four causes. 1) An empty page (bebetto.com.tr, 0 bytes) or a script that jumps to a parking page
// (stylemeshop.com) counted as "real content". 2) With a bare name, an address spelling the whole name was
// taken with nothing tying it to Turkey (mkcollection.com, a US fabrics company). 3) A map match under a city
// the planner guessed ("North Myrtle Beach") or abroad (Dnipro) counted as "on the map". 4) "HTTPS is healthy"
// was kept for a site answering 404.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';

const html = (title, body = '', lang = '') => `<html${lang ? ` lang="${lang}"` : ''}><head><title>${title}</title></head><body>${body}</body></html>`;
const LANDER = '<!DOCTYPE html><html><head><script>window.onload=function(){window.location.href="/lander"}</script></head></html>';

function fakeIO({ pages = {}, results = [], map = () => [], status = {} } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      if (status[url]) {
        const [code, to = url] = [].concat(status[url]);
        return { status: code, finalUrl: to, chain: to === url ? [{ url, status: code }] : [{ url, status: 301 }, { url: to, status: code }], body: '' };
      }
      const b = pages[url];
      return b !== undefined ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim(q) { return { results: map(q) }; },
    async search(q, { purpose } = {}) { return purpose === 'discover' ? { results } : { results: [] }; },
  };
}

const reply = (json) => Promise.resolve({ json, model: 'fake' });
const brainWith = (plan, claims = []) => ({
  models: { reasoning: 'fake', fast: 'fake' },
  plan: () => reply(plan),
  propose: () => reply({ claims }),
  verify: () => reply({ claims: [] }),
  write: () => reply({ owner_summary: '', pitch: { subject: '', opening: '', findings: [], offer: '', closing: '' } }),
});

test('an empty page or a script that jumps to a parking page is not real content', async () => {
  for (const body of ['', LANDER]) {
    const r = await runCheck(fakeIO({ pages: { 'https://x-shop.com/': body } }), 'page.not_parked', { url: 'https://x-shop.com/' });
    assert.equal(r.pass, false, JSON.stringify(body).slice(0, 40));
  }
  const real = await runCheck(fakeIO({ pages: { 'https://x-shop.com/': html('Formeya', '<p>Sıvı geçirmez alez ve yorgan</p>') } }), 'page.not_parked', { url: 'https://x-shop.com/' });
  assert.equal(real.pass, true);
});

test('bare name: an empty or parked address that spells the name is not "theirs" (stylemeshop.com, bebetto.com.tr)', async () => {
  const results = [{ url: 'https://www.instagram.com/stylemeshop/', title: 'Style Me Shop (@stylemeshop)', content: 'Style Me Shop' }];
  const r = await runCheck(fakeIO({ pages: { 'https://stylemeshop.com/': LANDER }, results }), 'web.own_site_found', { name: 'Style Me Shop' });
  assert.notEqual(r.pass, true, r.summary);
  const b = await runCheck(fakeIO({
    pages: { 'https://bebetto.com.tr/': '', 'https://bebetto.com/': html('', '<meta property="og:site_name" content="Bebetto | Bebekler İçin Doğal ve Şık Koleksiyonlar"><p>Bebek giyim, ücretsiz kargo</p>', 'tr') },
    results: [{ url: 'https://www.trendyol.com/bebetto', title: 'Bebetto', content: 'Bebetto bebek' }],
  }), 'web.own_site_found', { name: 'Bebetto' });
  assert.equal(b.pass, true, b.summary);
  assert.equal(b.observed.host, 'bebetto.com', 'the empty .com.tr is passed over for the working .com');
});

test('bare name: a name-built address with nothing Turkish on it may be a namesake abroad (mkcollection.com)', async () => {
  const results = [{ url: 'https://www.shopier.com/mkcollection', title: 'MK Collection - Shopier', content: 'MK Collection' }];
  const pages = { 'https://mkcollection.com/': html('MK Collection | Fabrics | Rugs | Wallcoverings', '<p>Showroom in New York. Fabrics, rugs and wallcoverings.</p>', 'en') };
  const r = await runCheck(fakeIO({ pages, results }), 'web.own_site_found', { name: 'MK Collection' });
  assert.notEqual(r.pass, true, r.summary);
});

test('bare name: a Turkish page at the name-built address is still found (lahzaabutik.com, naramica.com)', async () => {
  const results = [{ url: 'https://www.instagram.com/naramica/', title: 'Naramica (@naramica)', content: 'Seramik' }];
  const r = await runCheck(fakeIO({ pages: { 'https://naramica.com/': html('Naramica | Seramik Ürünleri', '<p>Sepete ekle · ₺450</p>', 'tr') }, results }), 'web.own_site_found', { name: 'Naramica' });
  assert.equal(r.pass, true, r.summary);
});

test('map: a match abroad, or under a city the user did not type, does not show this business is on the map', async () => {
  const usa = () => [{ name: 'Style Me Boutique', display_name: 'Style Me Boutique, North Myrtle Beach, South Carolina, United States', lat: '1', lon: '1', kind: 'shop=clothes' }];
  const guessed = await runCheck(fakeIO({ map: usa }), 'osm.listed', { name: 'Style Me Shop', city: 'North Myrtle Beach', cityGuessed: true });
  assert.notEqual(guessed.pass, true, guessed.summary);
  const ukr = () => [{ name: 'MK collection', display_name: 'MK collection, Dnipro, Ukraine', lat: '1', lon: '1', kind: 'shop=clothes' }];
  const abroad = await runCheck(fakeIO({ map: ukr }), 'osm.listed', { name: 'MK Collection' });
  assert.notEqual(abroad.pass, true, abroad.summary);
  // a typed city still settles it as before
  const tr = () => [{ name: 'Sakal Pub', display_name: 'Sakal Pub, Çankaya, Ankara, Türkiye', lat: '1', lon: '1', kind: 'amenity=pub' }];
  assert.equal((await runCheck(fakeIO({ map: tr }), 'osm.listed', { name: 'Sakal Pub', city: 'Ankara' })).pass, true);
});

test('"HTTPS is healthy" is not kept for a site that answers 404 (kivircikkizlargelsin.com)', async () => {
  const io = fakeIO({ status: { 'https://kivircikkizlargelsin.com/': 404, 'http://kivircikkizlargelsin.com/': [404, 'https://kivircikkizlargelsin.com/'] } });
  const brain = brainWith({ name: 'Kıvırcık Kızlar Gelsin', city: null, domain: 'kivircikkizlargelsin.com', phone: null, reasoning: '' }, [{ type: 'https_healthy', rationale: 'cert ok' }, { type: 'site_unreachable', rationale: '404' }]);
  const { report } = await runAgent({ query: 'Kıvırcık Kızlar Gelsin, kivircikkizlargelsin.com', io, brain });
  assert.ok(!report.verified.some((c) => c.type === 'https_healthy'), 'no "secure and working" about a 404');
  assert.ok(report.verified.some((c) => c.type === 'site_unreachable'));
});
