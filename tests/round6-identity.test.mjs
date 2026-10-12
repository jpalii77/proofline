// Round-6 accuracy errors (eval/verdicts-r6.json, 12 Oct): with the plain-name search more real sites were
// found, and so were namesakes and placeholders: "Lost Mind" became "Lost Minds" (a games company) and its
// address matched the planner's name; "Shout" was told it has no website; osepet.net ("Yakında Başlatılacak")
// counted as a real site; a template's 212 123 45 67 counted as the business's phone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { placeholderPhone, runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [], map = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: map }; },
    async search(q, { purpose } = {}) { return purpose === 'closure' ? { results: [] } : { results }; },
  };
}

test('bare name: identity is checked against the typed name, not the planner\'s tidier one ("Lost Minds")', async () => {
  const results = [{ title: 'Lost Minds - News', url: 'https://lostminds.com/', content: 'Lost Minds design software and games.' }];
  const io = fakeIO({ results, pages: { 'https://lostminds.com/': html('Lost Minds - News', '<p>Lost Minds design software and games.</p>') } });
  const reply = (json) => Promise.resolve({ json, model: 'fake' });
  const brain = {
    models: { reasoning: 'fake', fast: 'fake' },
    plan: () => reply({ name: 'Lost Minds', city: 'Bristol', domain: 'lostminds.com', phone: null, reasoning: 'the site names Lost Minds' }),
    propose: () => reply({ claims: [{ type: 'site_online', rationale: 'loads' }] }),
    verify: () => reply({ claims: [] }),
    write: () => reply({ owner_summary: '', pitch: { subject: '', opening: '', findings: [], offer: '', closing: '' } }),
  };
  const { report } = await runAgent({ query: 'Lost Mind', io, brain });
  assert.equal(report.ctx.name, 'Lost Mind');
  assert.equal(report.ctx.ownSite, false, 'lostminds.com is not settled as the typed business\'s site');
  assert.ok(!report.verified.some((c) => c.type === 'site_online'), 'no site claim about the namesake');
  assert.notEqual(report.card.name, 'Lost Minds', 'the card does not show the namesake\'s name');
});

test('bare name: with a city typed, the planner\'s name is still used as before', async () => {
  const io = fakeIO({ results: [], pages: {} });
  const reply = (json) => Promise.resolve({ json, model: 'fake' });
  const brain = {
    models: { reasoning: 'fake', fast: 'fake' },
    plan: () => reply({ name: 'Kaptan Oyuncak Mağazası', city: 'Ankara', domain: null, phone: null, reasoning: '' }),
    propose: () => reply({ claims: [] }), verify: () => reply({ claims: [] }),
    write: () => reply({ owner_summary: '', pitch: { subject: '', opening: '', findings: [], offer: '', closing: '' } }),
  };
  const { report } = await runAgent({ query: 'Kaptan Oyuncak, Ankara', io, brain });
  assert.equal(report.ctx.name, 'Kaptan Oyuncak Mağazası');
});

test('one common word: "no website of its own" is not settled; a long unusual word still can be', async () => {
  const results = [{ title: 'Shout - YouTube', url: 'https://www.youtube.com/watch?v=x', content: 'Shout' }];
  const r = await runCheck(fakeIO({ results }), 'web.own_site_found', { name: 'Shout' });
  assert.equal(r.pass, null, r.summary);
  assert.match(r.summary, /many businesses share/);
  const v = await runCheck(fakeIO({ results: [{ title: 'Vatkalimon', url: 'https://www.instagram.com/vatkalimon/', content: 'Vatkalimon' }] }), 'web.own_site_found', { name: 'Vatkalimon' });
  assert.equal(v.pass, false, v.summary);
  const two = await runCheck(fakeIO({ results: [{ title: 'Tuba Butik - Trendyol', url: 'https://www.trendyol.com/tuba-butik', content: 'Tuba Butik' }] }), 'web.own_site_found', { name: 'Tuba Butik' });
  assert.equal(two.pass, false, 'two words keep the old rule');
});

test('a "launching soon" page in Turkish or English is a placeholder, not a real site', async () => {
  for (const text of ['Yakında Başlatılacak', 'yakında açılacak', 'Sitemiz yapım aşamasında', 'Launching soon', 'Site under construction']) {
    const r = await runCheck(fakeIO({ pages: { 'https://osepet.net/': html('osepet.net', `<h1>${text}</h1>`) } }), 'page.not_parked', { url: 'https://osepet.net/' });
    assert.equal(r.pass, false, `${text}: ${r.summary}`);
  }
  const real = await runCheck(fakeIO({ pages: { 'https://x.com/': html('Kafe', '<p>Yeni menümüz yakında, şimdi uğrayın!</p>') } }), 'page.not_parked', { url: 'https://x.com/' });
  assert.equal(real.pass, true, 'the word "yakında" alone is not a placeholder');
});

test('placeholder phone numbers prove nothing either way', async () => {
  assert.equal(placeholderPhone('+90 212 123 45 67'), true);
  assert.equal(placeholderPhone('0555 555 55 55'), true);
  assert.equal(placeholderPhone('0212 765 43 21'), true);
  assert.equal(placeholderPhone('0232 555 01 47'), false);
  assert.equal(placeholderPhone('0541 311 56 54'), false);
  const page = html('Aktifim Kozmetik', '<p>Tel: 0212 123 45 67</p>');
  const r = await runCheck(fakeIO({ pages: { 'https://aktifimkozmetik.com/': page } }), 'page.phone_listed', { url: 'https://aktifimkozmetik.com/', phone: '2121234567' });
  assert.equal(r.pass, null, r.summary);
});

test('bare short name: a page whose only name is its own address does not settle the identity (osepet.net)', async () => {
  const page = '<html><head><title>osepet.net</title><meta property="og:site_name" content="osepet.net"></head><body>Yakında Başlatılacak</body></html>';
  const r = await runCheck(fakeIO({ pages: { 'https://osepet.net/': page } }), 'site.own_site', { host: 'osepet.net', name: 'Osepet' });
  assert.notEqual(r.pass, true, r.summary);
  const long = await runCheck(fakeIO({ pages: { 'https://erenhobi.com/': '<html><head><title>erenhobi.com</title></head><body>Drone</body></html>' } }), 'site.own_site', { host: 'erenhobi.com', name: 'Eren Hobi' });
  assert.equal(long.pass, true, 'a long name written as the address still counts');
});
