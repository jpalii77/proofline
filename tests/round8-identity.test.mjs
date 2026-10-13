// Round-8 accuracy errors (eval/verdicts-r8.json, 12 Oct), fresh list with mixed input: "D&P Perfumum" was
// told it is missing from OpenStreetMap because the planner guessed the city "Köln" for a bare name; its own
// site dpperfumum.com.tr was found by the name-built guess but then thrown away as "not seen in search";
// "Lahza Butik" was told it has no website, but its shop is lahzaabutik.com (the address doubles the a).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [], again = [], map = () => [] } = {}) {
  const searches = [];
  return {
    mode: 'test',
    searches,
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim(q) { return { results: map(q) }; },
    async search(q, { purpose } = {}) {
      searches.push({ q, purpose });
      if (purpose === 'closure') return { results: [] };
      if (purpose === 'discover-again') return { results: again };
      return { results };
    },
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

const DP_MAP = (q) => (/köln/i.test(q) ? [] : /perfumum/i.test(q)
  ? [{ name: 'D&P perfumum', display_name: 'D&P perfumum, Alemdağ Caddesi, Ümraniye, İstanbul, Türkiye', lat: '41.02', lon: '29.12', kind: 'shop=perfumery' }]
  : []);

test('a city the user did not type does not turn a map search into "not on the map" (D&P, "Köln")', async () => {
  const r = await runCheck(fakeIO({ map: DP_MAP }), 'osm.listed', { name: 'D&P Perfumum', city: 'Köln', cityGuessed: true });
  // found, not "missing"; with no typed city a one-word core name stays untied (not settled), never false
  assert.notEqual(r.pass, false, r.summary);
  assert.match(r.summary, /Ümraniye/);
  // a typed city still narrows the search as before
  const typed = await runCheck(fakeIO({ map: DP_MAP }), 'osm.listed', { name: 'D&P Perfumum', city: 'Köln' });
  assert.equal(typed.pass, false);
});

test('pipeline: a bare name with a guessed city keeps its map listing', async () => {
  const io = fakeIO({ map: DP_MAP, results: [{ url: 'https://www.instagram.com/dpperfumum/', title: 'D&P Perfumum (@dpperfumum)', content: 'Parfüm' }] });
  const brain = brainWith({ name: 'D&P Perfumum', city: 'Köln', domain: null, phone: null, reasoning: '' }, [{ type: 'not_on_map', rationale: 'no map match' }]);
  const { report } = await runAgent({ query: 'D&P Perfumum', io, brain });
  assert.ok(!report.verified.some((c) => c.type === 'not_on_map'), '"not on the map" is not kept');
});

test('the name-built address drops "&" and is used even though search never showed it (dpperfumum.com.tr)', async () => {
  const pages = { 'https://dpperfumum.com.tr/': html('D&P PERFUMUM', '<p>D&P Perfumum parfüm mağazası</p>') };
  const results = [{ url: 'https://www.instagram.com/dpperfumum/', title: 'D&P Perfumum (@dpperfumum)', content: 'Parfüm' }];
  const io = fakeIO({ pages, results, map: DP_MAP });
  const brain = brainWith({ name: 'D&P Perfumum', city: null, domain: null, phone: null, reasoning: '' }, [{ type: 'no_own_website', rationale: 'none found' }]);
  const { report } = await runAgent({ query: 'D&P Perfumum', io, brain });
  assert.equal(report.ctx.domain, 'dpperfumum.com.tr');
  assert.equal(report.ctx.ownSite, true);
  assert.ok(!report.verified.some((c) => c.type === 'no_own_website'), 'no false "no website"');
});

test('before "no website", a second search may find an address the name-built guesses cannot', async () => {
  // (lahzaabutik.com itself is now among the name-built guesses, round 11; this one is not)
  const results = [{ url: 'https://www.shopier.com/lahza', title: 'Lahza Butik - Shopier', content: 'Lahza Butik' }];
  const again = [{ url: 'https://lahzamoda.com/', title: 'Lahza Butik', content: 'Lahza Butik kadın giyim' }];
  const pages = { 'https://lahzamoda.com/': html('Lahza Butik', '<p>Lahza Butik kadın giyim</p>') };
  const io = fakeIO({ pages, results, again });
  const r = await runCheck(io, 'web.own_site_found', { name: 'Lahza Butik' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'lahzamoda.com');
  assert.ok(io.searches.some((s) => s.purpose === 'discover-again'));
});

test('second search: a different business it turns up is not taken, and "no website" still stands', async () => {
  const results = [{ url: 'https://www.shopier.com/zens', title: 'Zens Butik - Shopier', content: 'Zens Butik' }];
  const again = [{ url: 'https://zenshome.com/', title: 'Zens Home Decor', content: 'Zens Home furniture' }];
  const pages = { 'https://zenshome.com/': html('Zens Home Decor', '<p>Furniture</p>') };
  const r = await runCheck(fakeIO({ pages, results, again }), 'web.own_site_found', { name: 'Zens Butik' });
  assert.equal(r.pass, false, r.summary);
});

test('second search runs only on the way to "no website", never when a site was already found', async () => {
  const pages = { 'https://naramica.com/': html('Naramica | Seramik') };
  const io = fakeIO({ pages, results: [{ url: 'https://naramica.com/', title: 'Naramica', content: 'Seramik' }] });
  const r = await runCheck(io, 'web.own_site_found', { name: 'Naramica' });
  assert.equal(r.pass, true);
  assert.ok(!io.searches.some((s) => s.purpose === 'discover-again'));
});

test('address = name as one word allows exactly one doubled letter, nothing looser', async () => {
  const { labelIsName } = await import('../src/checks.mjs');
  assert.equal(labelIsName('lahzaabutik.com', 'Lahza Butik'), true);
  assert.equal(labelIsName('lahzabutik.com', 'Lahza Butik'), true);
  assert.equal(labelIsName('lahzaabutikk.com', 'Lahza Butik'), false, 'two doubled letters');
  assert.equal(labelIsName('lahzaxbutik.com', 'Lahza Butik'), false, 'an extra letter that is not a double');
  assert.equal(labelIsName('shoutt.com', 'Shout'), false, 'short names stay strict');
});
