// Recorded examples: real Nemotron answers are recorded once (npm run record-samples) and replayed
// by the demo. The replay is labelled as recorded, keeps the real model id / tokens / latency, never
// passes the planted wrong claims off as the model's, and falls back to the stand-in step by step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRecordedBrain, exampleBrain, hasRecording, recordedStep } from '../src/agent/recorded-brain.mjs';
import { recordSample } from '../src/agent/recorder.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';

const lumen = loadSamples().find((s) => s.id === 'lumen');
const SUPER = 'nvidia/nemotron-3-super-120b-a12b';
const NANO = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

// A stand-in for the Token Factory client: answers by schema name, counts calls.
function fakeLlm() {
  const calls = [];
  const enumOf = (schema, ...keys) => keys.reduce((s, k) => s?.properties?.[k] ?? s?.[k], schema)?.enum || [];
  const chat = async ({ tier, schema }) => {
    calls.push(schema.name);
    const model = tier === 'fast' ? NANO : SUPER;
    const usage = { in: 1000, out: 200, total: 1200, reasoning: null };
    const base = { model, usage, ms: 900, format: 'json_schema' };
    if (schema.name === 'business_identity') {
      return { ...base, json: { name: 'Lumen Coffee Roasters', city: 'Izmir', domain: 'lumencoffee.example', phone: '+90 232 555 01 47', reasoning: 'Nemotron: the site and listings agree.' } };
    }
    if (schema.name === 'claim_proposals') {
      return { ...base, json: { claims: [
        { type: 'site_online', rationale: 'Nemotron: the homepage loads and names the café.' },
        { type: 'ssl_expiring_soon', rationale: 'Nemotron: the certificate has 9 days left.' },
      ] } };
    }
    if (schema.name === 'owner_lines') {
      const ids = schema.schema.properties.claims.items.properties.id.enum;
      return { ...base, json: { claims: ids.map((id) => ({ id, owner_text: `Nemotron line for ${id}.` })) } };
    }
    const ids = enumOf(schema.schema, 'properties', 'pitch', 'properties', 'findings', 'items', 'properties', 'cites', 'items');
    return { ...base, json: { owner_summary: 'Nemotron summary.', pitch: { subject: 'Nemotron subject', opening: 'Hi.', findings: [{ text: 'Your certificate runs out soon.', cites: ids.slice(0, 1) }], offer: 'I can fix it.', closing: 'Thanks.' } } };
  };
  return { llm: { kind: 'fake', models: { reasoning: SUPER, fast: NANO }, chat }, calls };
}

async function recordedLumen() {
  const { llm, calls } = fakeLlm();
  const { recording, log } = await recordSample(lumen, llm, { today: '2026-10-12' });
  return { sample: { ...lumen, recorded: recording }, recording, log, calls };
}

test('recording asks the plan once and the other three steps per language', async () => {
  const { recording, log, calls } = await recordedLumen();
  assert.equal(calls.filter((c) => c === 'business_identity').length, 1);
  assert.equal(calls.length, 7);
  assert.deepEqual(log.map((l) => l.recorded), [['plan', 'propose', 'verify', 'write'], ['propose', 'verify', 'write']]);
  assert.equal(recording.at, '2026-10-12');
  assert.deepEqual(recording.models, { reasoning: SUPER, fast: NANO });
  assert.equal(recording.en.verify.model, NANO);
  assert.deepEqual(recording.en.propose.usage, { in: 1000, out: 200, total: 1200, reasoning: null });
});

for (const lang of ['en', 'tr']) {
  test(`replay (${lang}): real model ids, tokens and the recorded label on every call; no new calls`, async () => {
    const { sample } = await recordedLumen();
    const { report } = await runAgent({ query: sample.input, io: createSampleIO(sample), brain: exampleBrain(sample), lang });
    const calls = report.models.calls;
    assert.equal(calls.length, 4);
    for (const c of calls) {
      assert.equal(c.recordedAt, '2026-10-12');
      assert.ok(c.usage?.total > 0, `${c.stage} keeps its recorded tokens`);
      assert.equal(c.format, 'json_schema');
      assert.doesNotMatch(c.model, /sample/);
    }
    assert.equal(calls.find((c) => c.stage === 'verify').model, NANO);
    assert.equal(report.models.totals.tokens, 4800);
  });
}

test('replay: the gate still runs; planted claims are dropped and say they were planted', async () => {
  const { sample } = await recordedLumen();
  for (const lang of ['en', 'tr']) {
    const { report } = await runAgent({ query: sample.input, io: createSampleIO(sample), brain: exampleBrain(sample), lang });
    assert.deepEqual(report.verified.map((c) => c.type).sort(), ['site_online', 'ssl_expiring_soon']);
    const planted = report.dropped.find((c) => c.type === 'site_unreachable');
    assert.ok(planted, 'planted wrong claim is dropped');
    assert.match(planted.rationale, lang === 'tr' ? /^Bu örneğe bilerek eklendi, modelin önerisi değil: / : /^Planted for this demo, not proposed by the model: /);
    assert.equal(report.verified.find((c) => c.type === 'site_online').ownerText, 'Nemotron line for site_online.');
  }
});

test('a step that was not recorded falls back to the rule-based stand-in, named as such', async () => {
  const { sample } = await recordedLumen();
  delete sample.recorded.en.write;
  const { report } = await runAgent({ query: sample.input, io: createSampleIO(sample), brain: createRecordedBrain(sample), lang: 'en' });
  const write = report.models.calls.find((c) => c.stage === 'write');
  assert.equal(write.model, 'sample (rule-based)');
  assert.equal(write.recordedAt, undefined);
  assert.equal(report.models.calls.find((c) => c.stage === 'propose').recordedAt, '2026-10-12');
});

test('no recording: the examples keep the stand-in (empty fixtures/recorded files)', () => {
  for (const s of loadSamples()) {
    if (hasRecording(s)) continue;
    assert.equal(exampleBrain(s).models.provider, 'none (SAMPLE_MODE)');
  }
  assert.equal(hasRecording({ ...lumen, recorded: {} }), false);
  assert.equal(recordedStep({ ...lumen, recorded: { en: { plan: { json: null } } } }, 'plan'), null);
});

test('fixtures/recorded has one file per example, each valid JSON', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
  const samples = fs.readdirSync(path.join(root, 'sample')).filter((f) => f.endsWith('.json')).sort();
  const recorded = fs.readdirSync(path.join(root, 'recorded')).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(recorded, samples);
  for (const f of recorded) {
    const rec = JSON.parse(fs.readFileSync(path.join(root, 'recorded', f), 'utf8'));
    if (Object.keys(rec).length) assert.ok(rec.at && rec.models?.reasoning, `${f}: has a date and model ids`);
  }
});

test('every Nemotron call gets room to think and still answer (11 Oct: Nano ran out at 1,200)', async () => {
  const { createNemotronBrain, MAX_TOKENS } = await import('../src/agent/nemotron-brain.mjs');
  const sent = {};
  const llm = { models: { reasoning: SUPER, fast: NANO }, chat: async (a) => { sent[a.schema.name] = a.maxTokens; return { json: {}, model: SUPER }; } };
  const brain = createNemotronBrain(llm);
  const ctx = { name: 'x' };
  await brain.plan({ query: 'x', parsed: {}, discovery: [], grounding: { domains: [], phones: [] } });
  await brain.propose({ ctx, observations: [], catalog: [] });
  await brain.verify({ ctx, claims: [], lang: 'tr' });
  await brain.write({ ctx, claims: [], lang: 'tr' });
  assert.deepEqual(sent, { business_identity: MAX_TOKENS.plan, claim_proposals: MAX_TOKENS.propose, owner_lines: MAX_TOKENS.verify, summary_and_pitch: MAX_TOKENS.write });
  assert.ok(MAX_TOKENS.verify >= 2000 && MAX_TOKENS.write >= 2000 && MAX_TOKENS.propose >= 2000);
});

test('the shipped recordings replay: real calls labelled, gate still drops what it must', async () => {
  for (const s of loadSamples().filter(hasRecording)) {
    for (const lang of ['en', 'tr']) {
      const { report } = await runAgent({ query: s.input, io: createSampleIO(s), brain: exampleBrain(s), lang });
      assert.ok(report.verified.length > 0, `${s.id} ${lang}: something verified`);
      for (const c of report.models.calls) {
        if (/sample/.test(c.model)) assert.equal(c.recordedAt, undefined);
        else assert.equal(c.recordedAt, s.recorded.at, `${s.id} ${lang} ${c.stage}`);
      }
      for (const v of report.verified) assert.notEqual(v.type, (s.planted || []).find((p) => p.type === v.type)?.type, `${s.id}: a planted claim was verified`);
    }
  }
});
