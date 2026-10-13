// Round-9 accuracy errors (eval/verdicts-r9.json, 14 Oct): for the bare name "D&P Perfumum" the agent took
// dpperfumum.com.eg, an Egyptian shop of the same name, as the Istanbul shop's site (its own is
// dpperfumum.com.tr); for "Ahit Tesettür" an Instagram handle read as an address (ahit.tr, no DNS record)
// and a mangled Shopier link (shopier.co) kept "no website" from being settled.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { foreignCountryEnding, runCheck } from '../src/checks.mjs';
import { classifyHost } from '../src/platforms.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [], noDns = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup(host) { return noDns.includes(host) ? { a: [], aaaa: [], error: 'ENOTFOUND' } : { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: [] }; },
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

test('which endings belong to another country', () => {
  for (const h of ['dpperfumum.com.eg', 'shop.de', 'name.co.uk', 'x.fr']) assert.equal(foreignCountryEnding(h), true, h);
  for (const h of ['dpperfumum.com.tr', 'name.com', 'name.net', 'name.io', 'name.co', 'name.ai', 'name.tr', 'name.shop']) assert.equal(foreignCountryEnding(h), false, h);
});

test('bare name: another country\'s address that spells the whole name is a possible namesake, not "theirs"', async () => {
  const pages = { 'https://dpperfumum.com.eg/': html('D&P PERFUMUM', '<p>D&P Perfumum EGP</p>') };
  const r = await runCheck(fakeIO({ pages }), 'site.own_site', { host: 'dpperfumum.com.eg', name: 'D&P Perfumum', query: 'D&P Perfumum' });
  assert.equal(r.pass, null, r.summary);
  assert.match(r.summary, /another country/);
  // with a city typed the usual rules apply (the page must tie to that city), unchanged
});

test('pipeline (D&P): the planner\'s .com.eg pick is set aside and the shop\'s own .com.tr is used', async () => {
  const results = [{ url: 'https://www.dpperfumum.com.eg', title: 'D&P PERFUMUM', content: 'D&P Perfumum' }];
  const pages = {
    'https://dpperfumum.com.eg/': html('D&P PERFUMUM', '<p>D&P Perfumum EGP</p>'),
    'https://dpperfumum.com.tr/': html('D&P PERFUMUM', '<p>D&P Perfumum ₺</p>'),
  };
  const brain = brainWith({ name: 'D&P Perfumum', city: null, domain: 'dpperfumum.com.eg', phone: null, reasoning: '' }, [{ type: 'site_online', rationale: 'loads' }]);
  const { report } = await runAgent({ query: 'D&P Perfumum', io: fakeIO({ results, pages }), brain });
  assert.equal(report.ctx.domain, 'dpperfumum.com.tr');
  assert.equal(report.ctx.ownSite, true);
});

test('pipeline: with only the foreign address around, no site is settled and no claim about it is kept', async () => {
  const results = [{ url: 'https://www.dpperfumum.com.eg', title: 'D&P PERFUMUM', content: 'D&P Perfumum' }];
  const pages = { 'https://dpperfumum.com.eg/': html('D&P PERFUMUM', '<p>D&P Perfumum EGP</p>') };
  const brain = brainWith({ name: 'D&P Perfumum', city: null, domain: 'dpperfumum.com.eg', phone: null, reasoning: '' }, [{ type: 'site_online', rationale: 'loads' }]);
  const { report } = await runAgent({ query: 'D&P Perfumum', io: fakeIO({ results, pages }), brain });
  assert.equal(report.ctx.ownSite, false);
  assert.ok(!report.verified.some((c) => c.type === 'site_online'));
});

test('a platform under another ending is still that platform (shopier.co, tripadvisor.ie); short names are not stretched', () => {
  assert.equal(classifyHost('shopier.com').kind, 'platform');
  assert.equal(classifyHost('shopier.co').kind, 'platform');
  assert.equal(classifyHost('tripadvisor.ie').kind, 'platform');
  assert.equal(classifyHost('instagram.com.tr').kind, 'platform');
  assert.equal(classifyHost('armut.net').kind, 'independent', 'a 5-letter platform name is a common word');
  assert.equal(classifyHost('nuuwears.com').kind, 'independent');
});

test('an address with no DNS record is no website: it does not keep "no website" from being settled (ahit.tr)', async () => {
  const results = [
    { url: 'https://www.instagram.com/ahit.tr', title: 'Ahit Tesettür (@ahit.tr)', content: 'Ahit Tesettür ahit.tr shopier.co/ahit' },
  ];
  const r = await runCheck(fakeIO({ results, noDns: ['ahit.tr'] }), 'web.own_site_found', { name: 'Ahit Tesettür' });
  assert.equal(r.pass, false, r.summary);
});

test('a candidate that resolves but did not load still leaves the question open (unchanged)', async () => {
  const results = [{ url: 'https://www.instagram.com/ahit.tr', title: 'Ahit Tesettür (@ahit.tr)', content: 'Ahit Tesettür ahit.tr' }];
  const r = await runCheck(fakeIO({ results }), 'web.own_site_found', { name: 'Ahit Tesettür' });
  assert.equal(r.pass, null, r.summary);
});
