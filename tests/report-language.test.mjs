// The report in the language picked on the page (Ali, 7 Oct: a Turkish visitor gets a Turkish report).
// Models write the owner lines, summary and pitch in that language; the page translates the fixed
// wording code writes (claim sentences, check names and results, drop reasons). Facts never change.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain, languageRule } from '../src/agent/nemotron-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { CHECKS } from '../src/checks.mjs';
import { buildClaim, CLAIM_TYPES } from '../src/claims.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { createWebApp } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';
import { lanesFromEvents, lanesFromReport, laneFromGate } from '../public/gate-data.js';
import { checkTitle, claimStatement, dropReasonText, guardNoteText, modelDetailText, removedReasonText, summaryText } from '../public/report-lang.js';

const samples = loadSamples();
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

async function run(id, lang) {
  const s = samples.find((x) => x.id === id);
  const events = [];
  const out = await runAgent({ query: s.input, io: createSampleIO(s), brain: createSampleBrain(s), emit: (e) => events.push(e), ...(lang ? { lang } : {}) });
  return { ...out, events };
}

test('a Turkish run: owner lines, summary and pitch in Turkish, same facts as the English run', async () => {
  for (const s of samples) {
    const en = (await run(s.id)).report;
    const tr = (await run(s.id, 'tr')).report;
    assert.equal(en.lang, 'en');
    assert.equal(tr.lang, 'tr');
    assert.deepEqual(tr.verified.map((c) => c.type), en.verified.map((c) => c.type), `${s.id}: same kept claims`);
    assert.deepEqual(tr.dropped.map((c) => c.type), en.dropped.map((c) => c.type), `${s.id}: same dropped claims`);
    assert.deepEqual(tr.card, en.card, `${s.id}: same grade`);
    for (const c of tr.verified) {
      assert.match(c.ownerText, TR_CHARS, `${s.id}/${c.type}: owner line is Turkish`);
      assert.equal(c.statement, en.verified.find((x) => x.id === c.id).statement, 'the checked wording itself is unchanged');
    }
    assert.match(tr.summary, /doğrulanmış|sağlıklı/, `${s.id}: summary is Turkish`);
    assert.match(tr.pitch.opening, /Merhaba/);
    assert.ok(tr.pitch.findings.every((f) => f.text.startsWith('Şunu fark ettim')), `${s.id}: findings are Turkish`);
    assert.ok(tr.pitchRemoved.some((x) => /%40/.test(x.text)), `${s.id}: the uncited Turkish claim is still removed`);
  }
});

test('an unknown language falls back to English', async () => {
  const { report } = await run('lumen', 'de');
  assert.equal(report.lang, 'en');
  assert.doesNotMatch(report.summary, TR_CHARS);
});

test('Nemotron is told the language for the owner lines, summary and pitch only', async () => {
  const sent = {};
  const llm = { models: { reasoning: 'r', fast: 'f' }, chat: async (a) => { sent[a.tier + a.system.slice(0, 12)] = a.system; return { json: {} }; } };
  const brain = createNemotronBrain(llm);
  await brain.verify({ ctx: { name: 'X' }, claims: [], lang: 'tr' });
  await brain.write({ ctx: { name: 'X' }, claims: [], lang: 'tr' });
  await brain.plan({ query: 'x', parsed: {}, discovery: [], grounding: { domains: [], phones: [] } });
  const prompts = Object.values(sent);
  assert.equal(prompts.filter((p) => p.includes('in Turkish')).length, 2, 'verify and write ask for Turkish');
  assert.ok(!Object.entries(sent).find(([k]) => k.startsWith('reasoningYou identify'))[1].includes('Turkish'), 'the planner prompt is unchanged');
  assert.match(languageRule('tr'), /JSON keys, claim ids, domains, phone numbers and names/);
  assert.equal(languageRule(undefined), 'Write every text value in English.');
});

test('/api/run?lang=tr runs in Turkish; live answers are cached per language', async () => {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  const res = await app(new Request('https://demo.test/api/run?q=Lumen%20Coffee&lang=tr'));
  const text = await res.text();
  assert.match(text, /"lang":"tr"/);
  assert.match(text, /[Ww]eb siteniz/, "owner text in Turkish (recorded Nemotron or the stand-in)");
  const plain = await (await app(new Request('https://demo.test/api/run?q=Lumen%20Coffee&lang=xx'))).text();
  assert.match(plain, /"lang":"en"/);

  const sample = samples.find((s) => s.id === 'lumen');
  let plans = 0;
  const wireLive = () => { const brain = createSampleBrain(sample); const p = brain.plan; brain.plan = (a) => { plans++; return p(a); }; return { io: createSampleIO(sample), brain }; };
  const live = createWebApp({ env: { NEBIUS_API_KEY: 'test-not-real', TAVILY_API_KEY: 'test-not-real' }, store: createMemoryStore(), pace: false, wireLive });
  const ask = async (lang) => (await live(new Request(`https://demo.test/api/run?live=1&q=shop&lang=${lang}`, { headers: { 'cf-connecting-ip': '198.51.100.9' } }))).text();
  await ask('en');
  await ask('tr');
  assert.equal(plans, 2, 'a Turkish run is not served the English cache');
  assert.match(await ask('tr'), /"type":"cached"|event: cached/);
  assert.equal(plans, 2, 'the second Turkish run comes from the Turkish cache');
});

test('every claim type has a Turkish sentence that keeps its domain, phone and name', () => {
  const ctx = { domain: 'ornek.com.tr', phone: '+90 232 555 01 01', name: 'Kuzey Kafe', city: 'İzmir' };
  for (const type of Object.keys(CLAIM_TYPES)) {
    const { claim } = buildClaim(type, ctx);
    const tr = claimStatement(claim, ctx, 'tr');
    assert.notEqual(tr, claim.statement, `${type} has a Turkish sentence`);
    for (const v of [ctx.domain, ctx.phone, ctx.name]) if (claim.statement.includes(v)) assert.ok(tr.includes(v), `${type}: keeps ${v}`);
    assert.equal(claimStatement(claim, ctx, 'en'), claim.statement);
  }
  // Values that do not match the English sentence: keep the English rather than say something else.
  const { claim } = buildClaim('site_online', ctx);
  assert.equal(claimStatement(claim, { ...ctx, domain: 'baska.com' }, 'tr'), claim.statement);
  assert.equal(claimStatement({ type: 'new_type', statement: 'Something new.' }, ctx, 'tr'), 'Something new.');
});

test('every check has a Turkish name', () => {
  for (const id of Object.keys(CHECKS)) {
    if (id === 'site.own_site' || CHECKS[id].title) assert.match(checkTitle({ check: id, title: CHECKS[id].title }, 'tr'), /\S/);
    assert.notEqual(checkTitle({ check: id, title: CHECKS[id].title }, 'tr'), CHECKS[id].title, `${id} has a Turkish name`);
    assert.equal(checkTitle({ check: id, title: CHECKS[id].title }, 'en'), CHECKS[id].title);
  }
});

test('every check result in the four samples reads in Turkish', async () => {
  const left = [];
  for (const s of samples) {
    const { events } = await run(s.id, 'tr');
    const summaries = [
      ...events.filter((e) => e.type === 'observe').map((e) => e.summary),
      ...events.filter((e) => e.type === 'gate').flatMap((e) => e.evidence.map((x) => x.summary)),
    ];
    for (const x of summaries) if (summaryText(x, 'tr') === x) left.push(`${s.id}: ${x}`);
  }
  assert.deepEqual([...new Set(left)], [], 'untranslated check results');
});

test('check results: known sentences translate, values stay, unknown text is shown as sent', () => {
  assert.equal(summaryText('Loaded with HTTP 200 (ended at https://a.example/)', 'tr'), 'HTTP 200 ile açıldı (https://a.example/ adresinde bitti)');
  assert.equal(summaryText('Certificate expires in 12 day(s) (needs ≥ 30)', 'tr'), 'Sertifika 12 gün sonra bitiyor (en az 30 gerekir)');
  assert.equal(summaryText('+90 232 555 01 01 is not on the site (site lists: none)', 'tr'), '+90 232 555 01 01 sitede yok (sitedeki numaralar: yok)');
  assert.equal(summaryText('Own website found: kuzey.example names the business (title: “Kuzey Kafe”) (found by trying the address built from the name)', 'tr'),
    'Kendi web sitesi bulundu: kuzey.example işletmenin adını taşıyor (title: “Kuzey Kafe”) (addan türetilen adres denenerek bulundu)');
  assert.equal(summaryText('No website of its own among 5 search result(s); listings only: menulio.com.tr, yandex.com', 'tr'),
    '5 arama sonucunda kendi web sitesi yok; yalnızca listelemeler: menulio.com.tr, yandex.com');
  assert.equal(summaryText('Something brand new happened', 'tr'), 'Something brand new happened');
  assert.equal(summaryText('Page did not load', 'en'), 'Page did not load');
});

test('drop reasons are rebuilt in Turkish from the evidence', async () => {
  const { report } = await run('kuzey', 'tr');
  assert.ok(report.dropped.length, 'Kuzey has dropped claims');
  for (const c of report.dropped) {
    const why = dropReasonText(c, 'tr');
    assert.match(why, /gerekiyordu|sonuç alınamadı/, `${c.type}: ${why}`);
    assert.doesNotMatch(why, /expected (pass|fail)/);
    assert.equal(dropReasonText(c, 'en'), c.dropReason);
  }
  assert.equal(removedReasonText('no citation', 'tr'), 'kaynak göstermiyor');
  assert.equal(removedReasonText('introduced a number not in the evidence (40)', 'tr'), 'kanıtta olmayan bir sayı ekledi (40)');
});

test('gate lanes of a real run read in Turkish; the landing examples keep their own text', async () => {
  const { report, events } = await run('kuzey', 'tr');
  const fromReport = lanesFromReport(report, 'tr');
  const fromEvents = lanesFromEvents(events, 'tr');
  assert.deepEqual(fromEvents.map((l) => l.statement), fromReport.map((l) => l.statement));
  for (const l of fromReport.filter((x) => x.verdict === 'dropped')) assert.match(l.reason, /gerekiyordu|sonuç alınamadı/);
  assert.ok(fromReport.some((l) => TR_CHARS.test(l.statement)));
  const example = { id: 'h2', claimType: 'site_unreachable', verdict: 'dropped', dropReason: 'Örnek neden', statement: 'Örnek cümle', evidence: [{ check: 'http.reachable', matched: false }] };
  const lane = laneFromGate(example);
  assert.equal(lane.reason, 'Örnek neden');
  assert.equal(lane.statement, 'Örnek cümle');
  assert.deepEqual(lanesFromReport(report, 'en').map((l) => l.statement), [...report.verified, ...report.dropped].map((c) => c.statement));
});

test('the local server (npm run sample) also runs in the language asked for', async () => {
  const { once } = await import('node:events');
  const { readConfig } = await import('../src/runtime.mjs');
  const { createServer } = await import('../server.mjs');
  const server = createServer(readConfig({ SAMPLE_MODE: 'true' })).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const s of samples) {
      const tr = await fetch(`${base}/api/run?q=${encodeURIComponent(s.input)}&lang=tr`).then((r) => r.text());
      assert.match(tr, /event: done/, `${s.id} finishes`);
      assert.match(tr, /"lang":"tr"/, `${s.id} runs in Turkish`);
      const en = await fetch(`${base}/api/run?q=${encodeURIComponent(s.input)}`).then((r) => r.text());
      assert.match(en, /"lang":"en"/, `${s.id} defaults to English`);
    }
  } finally { server.close(); }
});

test('model call results read in Turkish for every sample run', async () => {
  assert.equal(modelDetailText('5 proposed · 2 kept by the gate · 3 dropped by the gate · 1 outside the catalog', 'tr'), '5 önerildi · 2 kapıdan geçti · 3 kapıda elendi · 1 katalog dışı');
  assert.equal(modelDetailText('1 rewrite(s) accepted · 1 rejected: site_online introduced a number not in the evidence (7)', 'tr'), '1 yeniden yazım kabul edildi · 1 reddedildi: site_online kanıtta olmayan bir sayı ekledi (7)');
  assert.equal(modelDetailText('5 proposed', 'en'), '5 proposed');
  for (const s of samples) {
    const { report } = await run(s.id, 'tr');
    for (const c of report.models.calls) if (c.detail) assert.notEqual(modelDetailText(c.detail, 'tr'), c.detail, `${s.id}/${c.stage}: ${c.detail}`);
  }
});

test('planner guard notes read in Turkish', () => {
  assert.equal(guardNoteText('phone +90 1 not seen in search results', 'tr'), '+90 1 telefonu arama sonuçlarında görülmedi');
  assert.match(guardNoteText('the model named a different business (“NaraConcept”) than the one asked for (“Naramica”) — its name, city, domain and phone are not used', 'tr'), /farklı bir işletme \(“NaraConcept”\)/);
  assert.equal(guardNoteText('phone +90 1 not seen in search results', 'en'), 'phone +90 1 not seen in search results');
});
