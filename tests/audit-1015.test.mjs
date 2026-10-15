// Audit of 15 Oct 2026 (four independent reviewers): the six fixes taken first.
// 1) a "$2" in a business name broke out of the shared report's meta tag (share.mjs replacement patterns)
// 2) two phone numbers side by side were read as one number, so the real one was "not on the site"
// 3) the closure check found the name inside other words ("Ada" in "Canada")
// 4) the writer's summary and pitch sentences reached the report with numbers nothing verified
// 5) [::ffff:127.0.0.1] and other IPv6 spellings of private addresses passed the private-address guard
// 6) a page full of unclosed tags made the page readers take seconds per 100 KB
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { runCheck } from '../src/checks.mjs';
import { createRealIO, isPrivateAddress } from '../src/io/real.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { extractPhones, headings, metaContent, pageTitle, visibleText } from '../src/text.mjs';
import { injectShareMeta } from '../src/web/share.mjs';

// 1 ─────────────────────────────────────────────────────────────────────────────────────────────

const shell = '<html><head><title>Proofline</title><meta property="og:title" content="Proofline"><meta name="description" content="x"></head></html>';
const shared = (name) => ({ events: [{ type: 'done', report: { ctx: { displayName: name }, stats: {} } }] });

test('a business name holding "$2", "$`" or "$&" stays inside the shared page\'s meta tags', () => {
  for (const trick of ['0;url=//example.org/$2 http-equiv=refresh x', 'a$`b', 'a$&b', "a$'b", 'a$1b']) {
    const out = injectShareMeta(shell, shared(trick));
    assert.doesNotMatch(out, /"\s+http-equiv/i, `${trick}: no attribute added after the quote`);
    assert.equal((out.match(/<title>/g) || []).length, 1, `${trick}: one title`);
    const og = /<meta property="og:title" content="([^"]*)">/.exec(out);
    assert.ok(og, `${trick}: og:title still one closed attribute`);
    assert.equal(og[1], `${trick.replace(/&/g, '&amp;').replace(/'/g, '&#39;')} — Proofline report`);
  }
});

// 2 ─────────────────────────────────────────────────────────────────────────────────────────────

test('two phone numbers side by side are read as two numbers', () => {
  assert.deepEqual(extractPhones('Tel: 0212 444 55 66 - 0532 765 43 21').sort(), ['2124445566', '5327654321']);
  assert.deepEqual(extractPhones('0212 444 55 66 0532 765 43 21').sort(), ['2124445566', '5327654321']);
  assert.deepEqual(extractPhones('212 444 55 66 / 216 333 22 11').sort(), ['2124445566', '2163332211']);
});

test('a year after a number does not join it', () => {
  assert.deepEqual(extractPhones('Tel 0212 123 45 67 2024'), ['2121234567']);
});

test('the usual ways of writing one number still read as that one number', () => {
  for (const s of ['0212 444 55 66', '+90 (212) 444 55 66', '+90 212 444 5566', '0 212 444 55 66', '(0212) 444-55-66', '02124445566', '0090 212 444 55 66']) {
    assert.deepEqual(extractPhones(s), ['2124445566'], s);
  }
  assert.deepEqual(extractPhones('0850 308 00 87'), ['8503080087']);
});

// 3 ─────────────────────────────────────────────────────────────────────────────────────────────

const searchIO = (results) => ({ async search() { return { results }; } });

test('a closure phrase about another business whose name only contains ours does not count', async () => {
  const r = await runCheck(searchIO([{ url: 'https://x.example/', title: 'Canada Grill', content: 'Canada Grill is permanently closed' }]), 'web.no_closure_signal', { name: 'Ada' });
  assert.equal(r.pass, true, r.summary);
  const m = await runCheck(searchIO([{ url: 'https://y.example/', title: 'Yerel haberler', content: 'Molalar Kafe kalıcı olarak kapandı' }]), 'web.no_closure_signal', { name: 'Mola' });
  assert.equal(m.pass, true, m.summary);
});

test('a closure phrase that names the business as a whole word still counts', async () => {
  const r = await runCheck(searchIO([{ url: 'https://x.example/', title: 'Haberler', content: 'Ada Kafe kalıcı olarak kapandı, Ada sahibi açıkladı' }]), 'web.no_closure_signal', { name: 'Ada' });
  assert.equal(r.pass, false, r.summary);
});

test('a name with no letters the check can compare is "not checked", never matched against everything', async () => {
  const r = await runCheck(searchIO([{ url: 'https://x.example/', title: 'Something', content: 'permanently closed' }]), 'web.no_closure_signal', { name: 'Мой магазин' });
  assert.equal(r.pass, null, r.summary);
});

// 4 ─────────────────────────────────────────────────────────────────────────────────────────────

const samples = loadSamples();

async function runWith(id, change) {
  const s = samples.find((x) => x.id === id);
  const base = createSampleBrain(s);
  const brain = { ...base, async write(args) { const out = await base.write(args); return { ...out, json: change(out.json, args) }; } };
  return (await runAgent({ query: s.input, io: createSampleIO(s), brain, emit: () => {} })).report;
}

test('summary and pitch sentences with numbers nothing verified are left out, and listed as removed', async () => {
  const report = await runWith('lumen', (json, args) => ({
    ...json,
    owner_summary: 'Your certificate expired 12 days ago and you are losing 40% of visitors.',
    pitch: {
      ...json.pitch,
      subject: 'Lumen: 7 problems',
      opening: 'Hi, I checked 500 cafés in your area.',
      findings: [{ text: 'Your site lost 37 customers last month.', cites: [args.claims[0].id] }, ...json.pitch.findings],
    },
  }));
  assert.equal(report.summary, '');
  assert.equal(report.pitch.opening, '');
  assert.equal(report.pitch.subject, '');
  assert.ok(!report.pitch.findings.some((f) => /37/.test(f.text)));
  for (const n of ['12', '500', '37', '7']) assert.ok(report.pitchRemoved.some((r) => new RegExp(`\\b${n}\\b`).test(r.text) && /not in the (verified|cited) evidence/.test(r.reason)), n);
});

test('numbers that come from the evidence, the name or a count of verified claims stay', async () => {
  const report = await runWith('lumen', (json, args) => ({
    ...json,
    owner_summary: `We verified ${args.claims.length} things about your site.`,
  }));
  assert.match(report.summary, /verified \d+ things/);
  const plain = await runWith('lumen', (json) => json);
  assert.ok(plain.summary.length > 0 && plain.pitch.opening.length > 0, 'the bundled sample writes stay whole');
});

// 5 ─────────────────────────────────────────────────────────────────────────────────────────────

test('IPv6 spellings of private addresses are private', () => {
  const host = (u) => new URL(u).hostname.replace(/^\[|\]$/g, '');
  for (const u of ['http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[::ffff:10.0.0.1]/', 'http://[::127.0.0.1]/',
    'http://[64:ff9b::127.0.0.1]/', 'http://[fe90::1]/', 'http://[febf::1]/', 'http://[fec0::1]/', 'http://[fd00::1]/', 'http://[ff02::1]/',
    'http://[::1]/', 'http://[::]/', 'http://[0:0:0:0:0:0:0:1]/', 'http://198.18.0.1/', 'http://192.0.0.8/']) {
    assert.equal(isPrivateAddress(host(u)), true, u);
  }
  assert.equal(isPrivateAddress('zz::1'), true, 'an address we cannot read is refused');
});

test('public addresses stay public', () => {
  for (const ip of ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:93.184.216.34', '2a00:1450:4017:80b::200e', '64:ff9b::8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('the live reader refuses [::ffff:127.0.0.1], also when a redirect leads there', async () => {
  let fetched = 0;
  const net = { kind: 'test', async lookup() { return ['93.184.216.34']; } };
  const fetchImpl = async (url) => {
    fetched += 1;
    if (url.startsWith('https://public.example')) return new Response('', { status: 302, headers: { location: 'http://[::ffff:7f00:1]:8080/admin' } });
    return new Response('secret', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  const io = createRealIO({ net, fetchImpl });
  const direct = await io.fetchPage('http://[::ffff:127.0.0.1]/');
  assert.match(direct.error, /private address refused/);
  const hop = await io.fetchPage('https://public.example/');
  assert.match(hop.error, /private address refused/);
  assert.equal(fetched, 1, 'only the public address was fetched');
});

// 6 ─────────────────────────────────────────────────────────────────────────────────────────────

const timed = (f) => { const t = performance.now(); f(); return performance.now() - t; };

test('a page full of unclosed tags is read quickly (400 KB, each reader under half a second)', () => {
  for (const [label, read, unit] of [
    ['visibleText', visibleText, '<script '], ['visibleText', visibleText, '<style '], ['visibleText', visibleText, '<'],
    ['pageTitle', pageTitle, '<title '], ['headings', headings, '<h1 '], ['metaContent', (h) => metaContent(h, 'og:site_name'), '<meta '],
  ]) {
    const page = unit.repeat(Math.floor(400_000 / unit.length));
    const ms = timed(() => read(page));
    assert.ok(ms < 500, `${label} on "${unit}" × 400 KB took ${Math.round(ms)} ms`);
  }
});

test('the contact-page and contact-form checks stay quick on a hostile page', async () => {
  const hostile = `<html><head><title>T</title></head><body><a href="/${'a'.repeat(300_000)}">x</a>${'<form '.repeat(20_000)}</body></html>`;
  const io = { async fetchPage(url) { return { status: 200, finalUrl: url, chain: [], body: hostile }; } };
  const t = performance.now();
  await runCheck(io, 'page.contact_path', { url: 'https://x.example/' });
  assert.ok(performance.now() - t < 1500, `contact_path took ${Math.round(performance.now() - t)} ms`);
});

test('the readers give the same answers as before on ordinary pages', () => {
  const page = `<html lang="tr"><head><TITLE> Sakal  Café &amp; Kahve </TITLE>
    <meta property="og:site_name" content="Sakal Café"><meta name="description" content="d"></head>
    <body><script>var x = "<h1>no</h1>";</script><style>.a{}</style>
    <h1 class="t">Hoş <b>geldiniz</b></h1><p>Bize ulaşın: 0212 444 55 66</p><H1>İkinci</H1> a < b</body></html>`;
  assert.equal(pageTitle(page), 'Sakal Café & Kahve');
  assert.equal(metaContent(page, 'og:site_name'), 'Sakal Café');
  assert.deepEqual(headings(page), ['no', 'Hoş geldiniz', 'İkinci'], 'as before, an h1 written inside a script string counts too');
  // as before, a lone "<" swallows the text up to the next ">"
  assert.equal(visibleText(page), 'Sakal Café & Kahve Hoş geldiniz Bize ulaşın: 0212 444 55 66 İkinci a');
  assert.equal(pageTitle('<html><body>no title</body></html>'), '');
  assert.equal(pageTitle('<titles>x</titles><title>Real</title>'), 'Real');
});
