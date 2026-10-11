// Records real Nemotron answers for the fictional examples (see recorded-brain.mjs). Each example runs
// through the normal pipeline on its recorded web data, with the live Nemotron brain; every answer
// the model gives (JSON, model id, tokens, latency, output format) is kept. A call that fails is not
// kept, so the replay falls back to the stand-in for that step and says so.

import { createNemotronBrain } from './nemotron-brain.mjs';
import { runAgent } from './pipeline.mjs';
import { createSampleIO } from '../io/sample.mjs';

const STAGES = ['plan', 'propose', 'verify', 'write'];

/**
 * Runs `sample` once per language with the live brain built on `llm` and returns
 * { recording, log }. The plan step does not depend on the language: it is asked once (first
 * language) and reused for the others, so no tokens are spent twice on it.
 */
export async function recordSample(sample, llm, { langs = ['en', 'tr'], today = new Date().toISOString().slice(0, 10) } = {}) {
  const live = createNemotronBrain(llm);
  const recording = { at: today, models: { reasoning: live.models.reasoning, fast: live.models.fast } };
  const log = [];
  for (const lang of langs) {
    const kept = {};
    const failed = [];
    const brain = { models: live.models };
    for (const stage of STAGES) {
      brain[stage] = async (args) => {
        if (stage === 'plan' && recording[langs[0]]?.plan) return recording[langs[0]].plan;
        try {
          const out = await live[stage](args);
          kept[stage] = { json: out.json, model: out.model, usage: out.usage || null, ms: out.ms ?? 0, ...(out.format ? { format: out.format } : {}) };
          return out;
        } catch (e) {
          failed.push(`${stage}: ${String(e.message || e).slice(0, 160)}`);
          throw e;
        }
      };
    }
    const { report } = await runAgent({ query: sample.input, io: createSampleIO(sample), brain, lang });
    recording[lang] = kept;
    log.push({
      lang,
      recorded: Object.keys(kept),
      failed,
      tokens: Object.values(kept).reduce((n, k) => n + (k.usage?.total || 0), 0),
      verified: report?.verified?.length ?? 0,
      dropped: report?.dropped?.length ?? 0,
    });
  }
  return { recording, log };
}
