// Recorded-Nemotron brain for the examples: replays real NVIDIA Nemotron answers (Nebius Token
// Factory) that `npm run record-samples` saved for each fictional business, so the public demo shows
// what the real model said, with its real model id, tokens, latency and output format, at no cost.
//
// Honest by construction:
// - every replayed call carries `recordedAt`, and the page says "recorded on <date>, no new tokens";
// - a step that was not recorded falls back to the rule-based stand-in, named as such;
// - the fixture's planted wrong claims are added after the model's own proposals and say they were
//   planted for the demo, so they are never passed off as something Nemotron proposed.
// The code checks after each call (gate, number check, citation lint) run on the replay exactly as live.

import { createSampleBrain } from './sample-brain.mjs';

const STAGES = ['plan', 'propose', 'verify', 'write'];
const PLANTED_NOTE = {
  en: 'Planted for this demo, not proposed by the model: ',
  tr: 'Bu örneğe bilerek eklendi, modelin önerisi değil: ',
};

/** True when a sample carries at least one recorded model answer. */
export function hasRecording(sample) {
  const rec = sample?.recorded;
  return !!rec && ['en', 'tr'].some((lang) => STAGES.some((s) => rec[lang]?.[s]?.json));
}

/** The recorded answer for one step, or null. The plan step does not depend on the language. */
export function recordedStep(sample, stage, lang = 'en') {
  const rec = sample?.recorded;
  if (!rec) return null;
  const pick = (l) => rec[l]?.[stage];
  const hit = stage === 'plan' ? pick('en') || pick('tr') : pick(lang);
  return hit && hit.json && typeof hit.json === 'object' ? hit : null;
}

export function createRecordedBrain(sample, { thinkMs = 0 } = {}) {
  const standIn = createSampleBrain(sample, { thinkMs });
  const at = sample.recorded?.at || null;
  const reply = async (hit, json) => {
    // Pace like the real call (capped) when the demo streams; never in tests.
    const wait = thinkMs ? Math.min(hit.ms || thinkMs, 1500) : 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return { json, model: hit.model, usage: hit.usage || null, ms: hit.ms ?? 0, ...(hit.format ? { format: hit.format } : {}), recordedAt: at };
  };
  const step = (stage) => (args) => {
    const hit = recordedStep(sample, stage, args?.lang);
    if (!hit) return standIn[stage](args);
    if (stage !== 'propose') return reply(hit, structuredClone(hit.json));
    const lang = args?.lang === 'tr' ? 'tr' : 'en';
    const own = Array.isArray(hit.json.claims) ? hit.json.claims : [];
    const planted = (sample.planted || [])
      .filter((p) => !own.some((c) => c?.type === p.type))
      .map((p) => ({ type: p.type, rationale: PLANTED_NOTE[lang] + ((lang === 'tr' && p.rationale_tr) || p.rationale) }));
    return reply(hit, { ...structuredClone(hit.json), claims: [...structuredClone(own), ...planted] });
  };
  const models = sample.recorded?.models;
  return {
    models: models?.reasoning
      ? { reasoning: models.reasoning, fast: models.fast || models.reasoning, provider: `Nebius Token Factory (recorded ${at || ''})`.replace(' ()', '') }
      : standIn.models,
    ...Object.fromEntries(STAGES.map((s) => [s, step(s)])),
  };
}

/** The brain for an example: recorded Nemotron answers when there are any, else the stand-in. */
export function exampleBrain(sample, opts = {}) {
  return hasRecording(sample) ? createRecordedBrain(sample, opts) : createSampleBrain(sample, opts);
}
