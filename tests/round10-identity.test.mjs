// Round-10 accuracy error (eval/verdicts-r10.json, 14 Oct): for "D&P Perfumum" the name-built guess
// dpperfumum.com answered on plain http only by forwarding to the shop's real site, dpperfumum.com.tr. The
// agent took the forwarding address as the site and told the owner "dpperfumum.com does not load", while
// the shop's site works. An address that forwards to another site is not the site: the target is.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

// pages: url -> body, or url -> { to, body } for a page that ends somewhere else after redirects
function fakeIO({ pages = {}, results = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const p = pages[url];
      if (!p) return { status: null, finalUrl: url, chain: [], error: 'ECONNREFUSED' };
      if (typeof p === 'string') return { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: p };
      return { status: 200, finalUrl: p.to, chain: [{ url, status: 301 }, { url: p.to, status: 200 }], body: p.body };
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

const site = html('D&P PERFUMUM', '<p>D&P Perfumum parfüm ₺</p>');
const DP_PAGES = {
  'http://dpperfumum.com/': { to: 'https://dpperfumum.com.tr/', body: site },
  'https://dpperfumum.com.tr/': site,
};
const results = [{ url: 'https://www.instagram.com/dpperfumum/', title: 'D&P Perfumum (@dpperfumum)', content: 'Parfüm' }];

test('own-site search: a name-built address that forwards to another site gives that site', async () => {
  const r = await runCheck(fakeIO({ pages: DP_PAGES, results }), 'web.own_site_found', { name: 'D&P Perfumum' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'dpperfumum.com.tr');
  assert.match(r.summary, /forwards to dpperfumum\.com\.tr/);
});

test('pipeline (D&P): no "does not load" about the forwarding address; the working site is checked', async () => {
  const brain = brainWith({ name: 'D&P Perfumum', city: null, domain: null, phone: null, reasoning: '' }, [{ type: 'site_unreachable', rationale: 'refused' }, { type: 'site_online', rationale: 'loads' }]);
  const { report } = await runAgent({ query: 'D&P Perfumum', io: fakeIO({ pages: DP_PAGES, results }), brain });
  assert.equal(report.ctx.domain, 'dpperfumum.com.tr');
  assert.ok(!report.verified.some((c) => c.type === 'site_unreachable'), 'no false "site down"');
  assert.ok(report.verified.some((c) => c.type === 'site_online'));
});

test('pipeline: the planner\'s pick that forwards to another site is replaced by the target', async () => {
  const pages = { ...DP_PAGES, 'https://dpperfumum.com/': { to: 'https://dpperfumum.com.tr/', body: site } };
  const res = [...results, { url: 'https://dpperfumum.com/', title: 'D&P PERFUMUM', content: 'D&P Perfumum' }];
  const brain = brainWith({ name: 'D&P Perfumum', city: null, domain: 'dpperfumum.com', phone: null, reasoning: '' });
  const { report } = await runAgent({ query: 'D&P Perfumum', io: fakeIO({ pages, results: res }), brain });
  assert.equal(report.ctx.domain, 'dpperfumum.com.tr');
});

test('forwarding within the same site (http to https, to www) changes nothing', async () => {
  const pages = { 'https://naramica.com/': { to: 'https://www.naramica.com/', body: html('Naramica | Seramik', '<p>Seramik ürünleri · ₺450</p>') } };
  const ig = [{ url: 'https://www.instagram.com/naramica/', title: 'Naramica (@naramica)', content: 'Seramik' }];
  const r = await runCheck(fakeIO({ pages, results: ig }), 'web.own_site_found', { name: 'Naramica' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'naramica.com');
});

test('a forward to a listing platform is not taken as the site', async () => {
  const pages = { 'https://naramica.com/': { to: 'https://www.instagram.com/naramica/', body: html('Naramica (@naramica)') } };
  const ig = [{ url: 'https://www.instagram.com/naramica/', title: 'Naramica (@naramica)', content: 'Seramik' }];
  const r = await runCheck(fakeIO({ pages, results: ig }), 'web.own_site_found', { name: 'Naramica' });
  assert.notEqual(r.observed.host, 'instagram.com');
});

// Round 11 (same list): the second search did not bring lahzaabutik.com back, and "no website" returned.
// Search results vary run to run; the name-built guess does not. It now also tries the name with the last
// letter of a word written twice (the one spelling labelIsName already accepts).
test('name-built guesses include one doubled letter at a word end (lahzaabutik.com), nothing for one word', async () => {
  const { obviousDomains } = await import('../src/checks.mjs');
  const g = obviousDomains('Lahza Butik');
  assert.ok(g.includes('lahzabutik.com') && g.includes('lahzaabutik.com'), g.join(', '));
  assert.deepEqual(obviousDomains('Naramica'), ['naramica.com', 'naramica.com.tr']);
});

test('own-site search finds lahzaabutik.com with no search help at all', async () => {
  const pages = { 'https://lahzaabutik.com/': html('Lahza - Kadın Modası', '<p>Lahza Butik</p>') };
  const results = [{ url: 'https://www.facebook.com/p/LAHZA-BUTIK-1', title: 'LAHZA BUTİK', content: 'Lahza Butik' }];
  const r = await runCheck(fakeIO({ pages, results }), 'web.own_site_found', { name: 'Lahza Butik' });
  assert.equal(r.pass, true, r.summary);
  assert.equal(r.observed.host, 'lahzaabutik.com');
});
