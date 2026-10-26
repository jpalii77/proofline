// A model can answer with the wrong shape: Nebius rejects a schema and the plain-JSON retry comes back
// with a string where a list belongs, a number for a name, null for a whole section. None of that may
// crash a run, put an unproven claim on the card or leave an uncited sentence in the pitch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';

const samples = loadSamples();

/** Wrong-shaped values a model has been seen to send (or could): every JSON type plus a few edge strings. */
const ODD = [null, '', 'yes', 0, -1, 1e309, true, [], [null], ['x'], {}, { x: 1 }, 'x'.repeat(5000), 'constructor', '__proto__'];

/** The fields each stage reads from the model's answer. */
const FIELDS = {
  plan: ['name', 'city', 'domain', 'phone', 'reasoning'],
  propose: ['claims'],
  verify: ['claims'],
  write: ['owner_summary', 'pitch'],
  second: ['domain', 'reasoning'],
};

/** Sample brain whose answer for one stage is replaced: the whole json, or one field of it. */
function oddBrain(sample, stage, field, value) {
  const b = createSampleBrain(sample);
  const base = { ...b, models: { ...b.models, ultra: 'nvidia/test-ultra' }, second: async () => (secondAsked++, { json: { domain: sample.domain || null, reasoning: 'same' }, model: 'nvidia/test-ultra', ms: 1 }) };
  const real = base[stage];
  base[stage] = async (args) => {
    const out = await real(args);
    if (field === null) return { ...out, json: value };
    return { ...out, json: { ...(out.json || {}), [field]: value } };
  };
  return base;
}

let secondAsked = 0;

function assertSound(report, label) {
  assert.ok(report && typeof report === 'object', `${label}: a report`);
  for (const c of report.verified || []) {
    assert.ok(Array.isArray(c.evidence) && c.evidence.length, `${label}: ${c.type} has evidence`);
    assert.ok(c.evidence.every((e) => e.matched), `${label}: ${c.type} is proven`);
  }
  const ids = new Set((report.verified || []).map((c) => c.id));
  for (const f of report.pitch?.findings || []) {
    assert.ok(Array.isArray(f.cites) && f.cites.length && f.cites.every((id) => ids.has(id)), `${label}: pitch line cites verified claims`);
  }
  // The page renders these as text; an object or a number here shows up as "[object Object]" or "1e+309".
  const text = (v) => v === null || v === undefined || typeof v === 'string';
  assert.ok(text(report.summary), `${label}: summary is text`);
  for (const k of ['subject', 'opening', 'offer', 'closing']) assert.ok(text(report.pitch?.[k]), `${label}: pitch.${k} is text`);
  for (const f of report.pitch?.findings || []) assert.equal(typeof f.text, 'string', `${label}: pitch line is text`);
  for (const k of ['name', 'displayName', 'city', 'domain', 'phone']) assert.ok(text(report.ctx?.[k]), `${label}: ctx.${k} is text`);
}

for (const stage of Object.keys(FIELDS)) {
  test(`${stage}: wrong-shaped answers never crash a run or reach the card unproven`, async () => {
    for (const s of samples) {
      // The typed line, and the name alone: only a bare name brings in the second opinion.
      for (const [query, lang] of [[s.input, 'en'], [s.input, 'tr'], [s.name, 'en']]) {
        for (const field of [null, ...FIELDS[stage]]) {
          for (const value of ODD) {
            const label = `${query}/${lang} ${stage}.${field ?? '(whole answer)'}=${JSON.stringify(value)?.slice(0, 20)}`;
            let out;
            try {
              out = await runAgent({ query, io: createSampleIO(s), brain: oddBrain(s, stage, field, value), lang });
            } catch (err) {
              assert.fail(`${label}: run threw ${err.stack}`);
            }
            assert.ok(!out.error, `${label}: ${out.error}`);
            assertSound(out.report, label);
          }
        }
      }
    }
    if (stage === 'second') assert.ok(secondAsked > 0, 'the bare-name runs reached the second opinion');
  });
}
