// Own-site eligibility. Reproduces the first live run (6 Oct): for "Sakal Kafe, Ankara" the
// planner picked menulio.com.tr, a QR-menu platform, as the café's website, and every claim made
// against that platform page was "verified". No network: fake fetch, fake Tavily, scripted brain.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { runCheck } from '../src/checks.mjs';
import { buildClaim, gateClaim } from '../src/claims.mjs';
import { classifyHost } from '../src/platforms.mjs';

const days = (n) => new Date(Date.now() + n * 86400000).toISOString();
const ok = (url, body) => ({ status: 200, finalUrl: url, chain: [{ url, status: 200 }], body });

const MENULIO_HOME = '<html><head><title>Menulio | Restoranlar için Dijital QR Menü</title><meta property="og:site_name" content="Menulio"></head><body><h1>QR menünüzü 5 dakikada oluşturun</h1><p>Kafe ve restoranlar için temassız menü.</p></body></html>';
const OWN_HOME = '<html><head><title>Sakal Café — Kahve &amp; Kahvaltı, Ankara</title></head><body><h1>Sakal Café</h1><p>Rezervasyon: <a href="tel:+903125551234">0312 555 12 34</a></p><form><input type="email" name="email"><textarea name="message"></textarea></form></body></html>';

const LISTINGS = [
  { title: 'Sakal Kafe Menü - Menulio', url: 'https://menulio.com.tr/sakal-kafe', content: 'Sakal Kafe, Kızılay, Çankaya / Ankara. Menüyü görüntüleyin. Tel: 0312 555 12 34' },
  { title: 'Sakal Kafe (@sakalkafe) • Instagram', url: 'https://www.instagram.com/sakalkafe/', content: 'Sakal Kafe · Kızılay, Ankara · 0312 555 12 34' },
  { title: 'Sakal Kafe, Ankara - Tripadvisor', url: 'https://www.tripadvisor.com.tr/Restaurant_Review-sakal-kafe', content: 'Sakal Kafe yorumları. menulio.com.tr üzerinden menü.' },
];

function fakeIO({ results, pages = {}, tls = {} }) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) { return pages[url] || { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' }; },
    async tlsCert(host) { return tls[host] || { error: 'ECONNREFUSED' }; },
    async nominatim() { return { results: [{ name: 'Sakal Kafe', display_name: 'Sakal Kafe, Kızılay, Çankaya, Ankara, Türkiye' }] }; },
    async search(q, { purpose } = {}) { return purpose === 'closure' ? { results: [] } : { results }; },
  };
}

// What Nemotron did on 6 Oct: pick the platform, then assert site claims from its page.
function scriptedBrain({ domain, claims }) {
  const reply = (json) => async () => ({ json, model: 'scripted', ms: 0 });
  return {
    models: { reasoning: 'scripted', fast: 'scripted' },
    plan: reply({ name: 'Sakal Kafe', city: 'Ankara', domain, phone: '0312 555 12 34', reasoning: 'menu link in results' }),
    propose: reply({ claims: claims.map((type) => ({ type, rationale: 'scripted' })) }),
    verify: reply({ claims: [] }),
    write: reply({ owner_summary: '', pitch: { findings: [] } }),
  };
}

const MENULIO_IO = () => fakeIO({
  results: LISTINGS,
  pages: { 'https://menulio.com.tr/': ok('https://menulio.com.tr/', MENULIO_HOME), 'http://menulio.com.tr/': ok('https://menulio.com.tr/', '') },
  tls: { 'menulio.com.tr': { validTo: days(200), authorized: true } },
});
const SIX_OCT_CLAIMS = ['site_online', 'https_healthy', 'no_contact_path', 'phone_unconfirmed', 'possibly_renamed', 'on_map'];
const SITE_TYPES = new Set(['site_online', 'site_unreachable', 'domain_parked', 'https_healthy', 'ssl_expiring_soon', 'ssl_invalid', 'no_https_redirect', 'no_contact_path', 'phone_confirmed', 'phone_unconfirmed', 'possibly_renamed']);

test('platform list: platforms, path listings and site builders are classified', () => {
  for (const h of ['menulio.com.tr', 'instagram.com', 'l.facebook.com', 'maps.google.com.tr', 'google.com', 'maps.app.goo.gl', 'linktr.ee', 'yemeksepeti.com', 'tripadvisor.com.tr', 'sahibinden.com']) {
    assert.equal(classifyHost(h).kind, 'platform', h);
  }
  assert.equal(classifyHost('sakalkafe.com.tr').kind, 'independent');
  assert.deepEqual(classifyHost('sakalkafe.wixsite.com'), { kind: 'builder', matched: 'wixsite.com', sub: 'sakalkafe' });
});

test('site.own_site: a platform host fails, with a reason a person can read', async () => {
  const r = await runCheck(MENULIO_IO(), 'site.own_site', { host: 'menulio.com.tr', name: 'Sakal Kafe', city: 'Ankara' });
  assert.equal(r.pass, false);
  assert.match(r.summary, /menulio\.com\.tr is a listing platform .*not the business's own website/);
});

test('site.own_site: an unknown domain whose page names someone else, with no search tie, fails', async () => {
  const io = fakeIO({ results: LISTINGS, pages: { 'https://othercafe.example/': ok('https://othercafe.example/', '<title>Kahve Durağı</title>') } });
  const r = await runCheck(io, 'site.own_site', { host: 'othercafe.example', name: 'Sakal Kafe' });
  assert.equal(r.pass, false);
  assert.match(r.summary, /does not identify/);
});

test('site.own_site: name match tolerates Turkish letters, case and Kafe/Cafe/Café', async () => {
  const io = fakeIO({ results: [], pages: { 'https://sakalkafe.com.tr/': ok('https://sakalkafe.com.tr/', OWN_HOME) } });
  for (const name of ['Sakal Kafe', 'SAKAL CAFE', 'sakal café']) {
    assert.equal((await runCheck(io, 'site.own_site', { host: 'sakalkafe.com.tr', name })).pass, true, name);
  }
  const tr = fakeIO({ results: [], pages: { 'https://kosebasi.example/': ok('https://kosebasi.example/', '<title>Köşebaşı Çay Bahçesi</title>') } });
  assert.equal((await runCheck(tr, 'site.own_site', { host: 'kosebasi.example', name: 'KOSEBASI cay bahcesi' })).pass, true);
});

test('site builders count only when the subdomain names the business', async () => {
  const io = fakeIO({ results: [], pages: { 'https://sakalkafe.wixsite.com/': ok('https://sakalkafe.wixsite.com/', OWN_HOME) } });
  assert.equal((await runCheck(io, 'site.own_site', { host: 'sakalkafe.wixsite.com', name: 'Sakal Kafe' })).pass, true);
  assert.equal((await runCheck(io, 'site.own_site', { host: 'wixsite.com', name: 'Sakal Kafe' })).pass, false);
  assert.equal((await runCheck(io, 'site.own_site', { host: 'bestmenus.wixsite.com', name: 'Sakal Kafe' })).pass, false);
});

test('Sakal Kafe (6 Oct live run): menulio.com.tr is a listing, not the café’s site', async () => {
  const events = [];
  const { report } = await runAgent({
    query: 'Sakal Kafe, Ankara', io: MENULIO_IO(), brain: scriptedBrain({ domain: 'menulio.com.tr', claims: SIX_OCT_CLAIMS }), emit: (e) => events.push(e),
  });

  // No site-dependent check ran against the platform page during gather.
  const observed = events.filter((e) => e.type === 'observe').map((e) => e.check);
  for (const c of ['page.contact_path', 'page.phone_listed', 'page.name_match', 'tls.cert_valid', 'http.https_redirect']) assert.ok(!observed.includes(c), `${c} must not run against a platform`);
  const plan = events.find((e) => e.type === 'plan');
  assert.equal(plan.ctx.ownSite, false);
  assert.match(plan.guard.join(' '), /menulio\.com\.tr is a listing platform/);

  // No site-dependent claim survives; the rename claim in particular is dropped.
  const kept = report.verified.map((c) => c.type);
  for (const t of kept) assert.ok(!SITE_TYPES.has(t), `site claim ${t} must not be kept`);
  const renamed = report.dropped.find((c) => c.type === 'possibly_renamed');
  assert.ok(renamed, 'possibly_renamed is dropped');
  for (const d of report.dropped) assert.match(d.dropReason, /menulio\.com\.tr is a listing platform .*not the business's own website/, `${d.type} explains why`);

  // "No own website" is reported as a finding, and presence on the map still counts.
  const noSite = report.verified.find((c) => c.type === 'no_own_website');
  assert.ok(noSite, 'no_own_website is verified');
  assert.match(noSite.evidence[0].summary, /listings only: .*menulio\.com\.tr\/sakal-kafe/);
  assert.ok(kept.includes('on_map'));
  assert.equal(report.stats.verified, 2);
});

test('when the planner picks a platform but search also shows the real site, the agent uses the real site', async () => {
  const io = fakeIO({
    results: [{ title: 'Sakal Café — Kahve & Kahvaltı, Ankara', url: 'https://sakalkafe.com.tr/', content: 'Kızılay. 0312 555 12 34' }, ...LISTINGS],
    pages: { 'https://sakalkafe.com.tr/': ok('https://sakalkafe.com.tr/', OWN_HOME), 'https://menulio.com.tr/': ok('https://menulio.com.tr/', MENULIO_HOME) },
  });
  const events = [];
  const { report } = await runAgent({ query: 'Sakal Kafe, Ankara', io, brain: scriptedBrain({ domain: 'menulio.com.tr', claims: ['site_online', 'phone_confirmed'] }), emit: (e) => events.push(e) });
  assert.equal(report.ctx.domain, 'sakalkafe.com.tr');
  assert.match(events.find((e) => e.type === 'plan').guard.join(' '), /using sakalkafe\.com\.tr instead/);
  assert.deepEqual(report.verified.map((c) => c.type).sort(), ['phone_confirmed', 'site_online']);
  assert.ok(!report.verified.some((c) => c.type === 'no_own_website'));
});

test('positive: a real own domain with a matching name still gets its site claims', async () => {
  const io = fakeIO({
    results: [{ title: 'Sakal Café — Kahve & Kahvaltı, Ankara', url: 'https://sakalkafe.com.tr/', content: 'Kızılay, Ankara. 0312 555 12 34' }, ...LISTINGS],
    pages: { 'https://sakalkafe.com.tr/': ok('https://sakalkafe.com.tr/', OWN_HOME), 'http://sakalkafe.com.tr/': ok('https://sakalkafe.com.tr/', '') },
    tls: { 'sakalkafe.com.tr': { validTo: days(120), authorized: true } },
  });
  const { report } = await runAgent({
    query: 'Sakal Kafe, Ankara', io,
    brain: scriptedBrain({ domain: 'sakalkafe.com.tr', claims: ['site_online', 'https_healthy', 'phone_confirmed', 'possibly_renamed', 'no_own_website'] }),
  });
  assert.equal(report.ctx.ownSite, true);
  assert.deepEqual(report.verified.map((c) => c.type).sort(), ['https_healthy', 'phone_confirmed', 'site_online']);
  assert.deepEqual(report.dropped.map((c) => c.type).sort(), ['no_own_website', 'possibly_renamed']);
});

test('rename needs a search-result tie: a name mismatch alone on an unverified domain is dropped', async () => {
  const ctx = { name: 'Sakal Kafe', city: 'Ankara', domain: 'kahveduragi.example' };
  const pages = { 'https://kahveduragi.example/': ok('https://kahveduragi.example/', '<title>Kahve Durağı</title><p>Hoş geldiniz</p>') };
  const { claim } = buildClaim('possibly_renamed', ctx);
  const untied = await gateClaim(fakeIO({ results: LISTINGS, pages }), claim);
  assert.equal(untied.verdict, 'dropped');
  assert.match(untied.dropReason, /No search result ties kahveduragi\.example to “Sakal Kafe”/);
  // With a directory entry for Sakal Kafe that names the domain, the same mismatch is a real signal.
  const tie = { title: 'Sakal Kafe — Kızılay', url: 'https://rehber.example/sakal-kafe', content: 'Sakal Kafe · kahveduragi.example · 0312 555 12 34' };
  const tied = await gateClaim(fakeIO({ results: [tie], pages }), claim);
  assert.equal(tied.verdict, 'verified');
});
