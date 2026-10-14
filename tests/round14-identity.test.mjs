// Round-14 lost findings (eval/verdicts-r14.json, 14 Oct): no wrong kept claim, but true findings left out.
// 1) Thesezar, typed with İzmir: its 5 MB homepage names İzmir only past the part we read, so its own site
//    stayed "not settled". The contact page the homepage links to (/pages/iletisim) names İzmir early on.
// 2) Morfose, a bare name: the report was about themorfose.com, the brand's US store, while the Turkish
//    business's site is morfose.eu/tr (morfose.com.tr forwards there). With a bare name, a chosen site that
//    shows nothing Turkish now gives way to a name-built Turkish address that does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';

const html = (title, body = '', lang = '') => `<html${lang ? ` lang="${lang}"` : ''}><head><title>${title}</title></head><body>${body}</body></html>`;

// pages: url -> body, or url -> { to, body } for a page that ends somewhere else
function fakeIO({ pages = {}, results = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const p = pages[url];
      if (p === undefined) return { status: null, finalUrl: url, chain: [], error: 'ECONNREFUSED' };
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

test('a typed city missing from the homepage is looked for on the contact page it links to (Thesezar, İzmir)', async () => {
  const home = html('Thesezar', '<meta property="og:site_name" content="Thesezar"><a href="/pages/iletisim">İletişim</a><p>Yeni sezon ürünler</p>', 'tr');
  const contact = html('İletişim – Thesezar', '<p>Adres: Konak, İzmir</p>', 'tr');
  const io = fakeIO({ pages: { 'https://thesezar.com/': home, 'https://thesezar.com/pages/iletisim': contact } });
  const r = await runCheck(io, 'site.own_site', { host: 'thesezar.com', name: 'Thesezar', city: 'İzmir', query: 'Thesezar İzmir' });
  assert.equal(r.pass, true, r.summary);
  assert.match(r.summary, /contact page/);
});

test('a contact page on another site is not used, and without one the answer stays "not settled"', async () => {
  const home = html('Thesezar', '<meta property="og:site_name" content="Thesezar"><a href="https://othersite.com/iletisim">İletişim</a>', 'tr');
  const io = fakeIO({ pages: { 'https://thesezar.com/': home, 'https://othersite.com/iletisim': html('X', 'İzmir') } });
  const r = await runCheck(io, 'site.own_site', { host: 'thesezar.com', name: 'Thesezar', city: 'İzmir', query: 'Thesezar İzmir' });
  assert.equal(r.pass, null, r.summary);
});

test('another country\'s ending is fine when the page itself is Turkish (morfose.eu/tr)', async () => {
  const eu = { to: 'https://morfose.eu/tr/', body: html('Morfose | Dünyanın Her Yerindeki Güzellikler İçin', '<p>Saç bakım ürünleri</p>', 'tr-TR') };
  const r = await runCheck(fakeIO({ pages: { 'https://morfose.eu/': eu } }), 'site.own_site', { host: 'morfose.eu', name: 'Morfose', query: 'Morfose' });
  assert.equal(r.pass, true, r.summary);
});

test('bare name: a chosen site with nothing Turkish gives way to the Turkish site the name-built address leads to (Morfose)', async () => {
  const us = html('Morfose | Professional Hair Care Products, Official US Store', '<meta property="og:site_name" content="The Morfose"><p>Free shipping in the USA</p>', 'en');
  const pages = {
    'https://themorfose.com/': us,
    'http://morfose.com.tr/': { to: 'https://morfose.eu/tr/', body: html('Morfose | Dünyanın Her Yerindeki Güzellikler İçin', '<p>Saç bakım</p>', 'tr-TR') },
    'https://morfose.eu/': { to: 'https://morfose.eu/tr/', body: html('Morfose | Dünyanın Her Yerindeki Güzellikler İçin', '<p>Saç bakım</p>', 'tr-TR') },
  };
  const results = [{ url: 'https://themorfose.com', title: 'Morfose | Official US Store', content: 'The Morfose hair care' }];
  const brain = brainWith({ name: 'Morfose', city: null, domain: 'themorfose.com', phone: null, reasoning: '' }, [{ type: 'site_online', rationale: 'loads' }]);
  const { report } = await runAgent({ query: 'Morfose', io: fakeIO({ pages, results }), brain });
  assert.equal(report.ctx.domain, 'morfose.eu');
  assert.equal(report.ctx.ownSite, true);
});

test('bare name: a chosen Turkish site is kept as it is (no extra lookups needed)', async () => {
  const pages = { 'https://begonkahve.com/': html('Begon Kahve | Nitelikli Filtre Kahve', '<p>Sepete ekle ₺</p>', 'tr') };
  const results = [{ url: 'https://begonkahve.com', title: 'Begon Kahve', content: 'Begon Kahve' }];
  const brain = brainWith({ name: 'Begon Kahve', city: null, domain: 'begonkahve.com', phone: null, reasoning: '' });
  const { report } = await runAgent({ query: 'Begon Kahve', io: fakeIO({ pages, results }), brain });
  assert.equal(report.ctx.domain, 'begonkahve.com');
});
