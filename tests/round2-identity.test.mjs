// Round-2 accuracy errors (docs/accuracy.md): an agency homepage that lists the business as a client was
// taken for its site (perfist.com / Tarım Garaj), the planner swapped the typed business for another one
// (Naramica -> NaraConcept, Athens), and a very large homepage lost a true site (petpal.com.tr).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent, sameBusinessName } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) { const b = pages[url]; return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' }; },
    async tlsCert() { return { error: 'ECONNREFUSED' }; },
    async nominatim() { return { results: [] }; },
    async search(q, { purpose } = {}) { return purpose === 'closure' ? { results: [] } : { results }; },
  };
}

const AGENCY = html('Perfist Growth and Data-Driven Digital Marketing Agency', '<h2>Case studies</h2><p>Tarım Garaj, headquartered in Konya, is one of Turkey\'s largest suppliers. We grew its online sales.</p>');

test('own site: a client mention in an agency homepage\'s body text is not the business\'s site', async () => {
  const r = await runCheck(fakeIO({ pages: { 'https://perfist.com/': AGENCY } }), 'site.own_site', { host: 'perfist.com', name: 'Tarım Garaj', city: 'Konya' });
  assert.equal(r.pass, false);
  assert.equal(r.observed.identity.bodyOnly, true);
});

test('own site: body text still counts when the address itself names the business', async () => {
  const page = html('Online Mağaza', '<p>Tarım Garaj güvencesiyle traktör yedek parça. Konya</p>');
  const r = await runCheck(fakeIO({ pages: { 'https://tarimgaraj.com/': page } }), 'site.own_site', { host: 'tarimgaraj.com', name: 'Tarım Garaj', city: 'Konya' });
  assert.equal(r.pass, true);
});

test('own site: an address that names the business counts on a huge homepage, only if the page names the city', async () => {
  const shop = html('Pet Ürünleri Online Satış - Aynı Gün Kargo', '<p>Bursa içi aynı gün teslimat. Nilüfer</p>');
  assert.equal((await runCheck(fakeIO({ pages: { 'https://petpal.com.tr/': shop } }), 'site.own_site', { host: 'petpal.com.tr', name: 'Petpal', city: 'Bursa' })).pass, true);
  const abroad = html('Pet supplies', '<p>Free shipping in Texas</p>');
  assert.equal((await runCheck(fakeIO({ pages: { 'https://petpal.com.tr/': abroad } }), 'site.own_site', { host: 'petpal.com.tr', name: 'Petpal', city: 'Bursa' })).pass, null);
});

test('name guard: a tidier spelling is the same business, another name is not', () => {
  assert.equal(sameBusinessName('hicret kuruyemiş', 'Hicret Kuruyemiş'), true);
  assert.equal(sameBusinessName('Kaptan Oyuncak', 'Kaptan Oyuncak Mağazası'), true);
  assert.equal(sameBusinessName('Sakal Kafe Pub', 'Sakal Pub'), true);
  assert.equal(sameBusinessName('Naramica', 'NaraConcept'), false);
});

test('name guard: when the planner names another business, its name, city, domain and phone are not used', async () => {
  const results = [
    { title: 'Naramica (@naramica) • Instagram', url: 'https://www.instagram.com/naramica/', content: 'Naramica seramik' },
    { title: 'NaraConcept | Athens', url: 'https://naraconcept.gr/', content: 'NaraConcept, Athens. Tel +30 210 988 8625' },
  ];
  const io = fakeIO({ results, pages: { 'https://naraconcept.gr/': html('NaraConcept', '<p>Athens</p>') } });
  const reply = (json) => async () => ({ json, model: 'scripted', ms: 0 });
  const brain = {
    models: { reasoning: 'scripted', fast: 'scripted' },
    plan: reply({ name: 'NaraConcept', city: 'Athens', domain: 'naraconcept.gr', phone: '+30 210 988 8625' }),
    propose: reply({ claims: [{ type: 'not_on_map', rationale: 'scripted' }] }),
    verify: reply({ claims: [] }),
    write: reply({ owner_summary: '', pitch: { findings: [] } }),
  };
  const events = [];
  const { report } = await runAgent({ query: 'Naramica', io, brain, emit: (e) => events.push(e) });
  const blob = JSON.stringify(report.verified);
  assert.ok(!/NaraConcept|naraconcept|Athens/.test(blob), blob);
  assert.ok(JSON.stringify(events).includes('the model named a different business'));
});
