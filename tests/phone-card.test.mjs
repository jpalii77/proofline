// Phone check of 11 Oct (375 px, Turkish): what a first-time visitor reads on the health card and in
// the model panels. A listing platform is never shown as the business's address; nothing stays in
// English in a Turkish report where we write the words ourselves.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain } from '../src/agent/nemotron-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { cardFacts, modelName, summaryText } from '../public/report-lang.js';

const samples = loadSamples();
const kuzey = samples.find((s) => s.id === 'kuzey');
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

test('health card: a listing platform is not shown as the business address', async () => {
  const { report } = await runAgent({ query: kuzey.input, io: createSampleIO(kuzey), brain: createSampleBrain(kuzey) });
  assert.equal(report.ctx.ownSite, false);
  assert.ok(report.verified.some((c) => c.type === 'no_own_website'), 'the card says there is no website of its own');
  const facts = cardFacts(report.ctx);
  assert.ok(!facts.includes(report.ctx.domain), `“${report.ctx.domain}” must not sit under the name`);
  assert.ok(facts.includes('Eskişehir'));
});

test('health card: an own website is shown; an old report without ownSite keeps its domain', async () => {
  const lumen = samples.find((s) => s.id === 'lumen');
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: createSampleBrain(lumen) });
  assert.equal(report.ctx.ownSite, true);
  assert.ok(cardFacts(report.ctx).includes(report.ctx.domain));
  assert.deepEqual(cardFacts({ domain: 'old.example', city: 'Izmir' }), ['old.example', 'Izmir']);
  assert.deepEqual(cardFacts(null), []);
});

test('the platform kind in a check result is Turkish in a Turkish report', () => {
  const en = "qrmenu.example is a listing platform (menu / QR-menu provider), not the business's own website";
  assert.equal(summaryText(en, 'tr'), 'qrmenu.example bir listeleme platformu (menü / QR menü sağlayıcısı), işletmenin kendi sitesi değil');
  assert.equal(summaryText(en, 'en'), en);
  assert.match(summaryText("x.example is a listing platform (some new kind), not the business's own website", 'tr'), /\(some new kind\)/, 'an unknown kind is kept, not guessed');
});

test('the rule-based stand-in is named in Turkish; real model ids never change', () => {
  assert.equal(modelName('sample (rule-based)', 'tr'), 'örnek (kurallara dayalı)');
  assert.equal(modelName('sample (rule-based)', 'en'), 'sample (rule-based)');
  assert.equal(modelName('nvidia/nemotron-3-super-120b-a12b', 'tr'), 'nvidia/nemotron-3-super-120b-a12b');
  assert.equal(modelName(undefined, 'tr'), '');
});

test('a Turkish run gives the dropped claims a Turkish reason; English stays English', async () => {
  for (const s of samples) {
    for (const lang of ['tr', 'en']) {
      const { report } = await runAgent({ query: s.input, io: createSampleIO(s), brain: createSampleBrain(s), lang });
      const planted = new Set((s.planted || []).map((p) => p.type));
      const reasons = report.dropped.filter((c) => planted.has(c.type)).map((c) => c.rationale);
      assert.ok(reasons.length, `${s.id}: planted claims are dropped`);
      for (const r of reasons) {
        if (lang === 'tr') assert.match(r, TR_CHARS, `${s.id}: “${r}”`);
        else assert.doesNotMatch(r, TR_CHARS, `${s.id}: “${r}”`);
      }
    }
  }
});

test('live: the claim proposer is asked for Turkish reasons only in a Turkish run', async () => {
  const systems = [];
  const llm = {
    models: { reasoning: 'r', fast: 'f' },
    chat: async ({ system }) => { systems.push(system); return { json: {}, model: 'r', usage: null, ms: 1 }; },
  };
  const brain = createNemotronBrain(llm);
  await brain.propose({ ctx: {}, observations: [], catalog: [], lang: 'tr' });
  await brain.propose({ ctx: {}, observations: [], catalog: [], lang: 'en' });
  assert.match(systems[0], /Write each rationale in Turkish/);
  assert.doesNotMatch(systems[1], /Turkish/);
});
