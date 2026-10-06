// Picks sample or live wiring from environment variables. Keys are read from process.env only;
// they are never logged, returned to the browser or written anywhere.

import { createNemotronBrain } from './agent/nemotron-brain.mjs';
import { createSampleBrain } from './agent/sample-brain.mjs';
import { createRealIO } from './io/real.mjs';
import { createSampleIO, findSample, loadSamples } from './io/sample.mjs';
import { createTokenFactoryClient, DEFAULT_BASE_URL, DEFAULT_REASONING_MODEL } from './llm.mjs';
import { createTavilyClient } from './tavily.mjs';

export function readConfig(env = process.env) {
  const sampleMode = String(env.SAMPLE_MODE ?? '').toLowerCase() === 'true' || !env.NEBIUS_API_KEY;
  return {
    sampleMode,
    sampleForced: String(env.SAMPLE_MODE ?? '').toLowerCase() === 'true',
    port: Number(env.PORT) || 8787,
    nebius: {
      apiKey: env.NEBIUS_API_KEY || '',
      baseUrl: env.NEBIUS_BASE_URL || DEFAULT_BASE_URL,
      reasoningModel: env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL,
      fastModel: env.NEBIUS_FAST_MODEL || '',
    },
    tavilyKey: env.TAVILY_API_KEY || '',
    nominatimContact: env.NOMINATIM_CONTACT || '',
  };
}

/** Public, key-free description of the current setup (safe to send to the browser). */
export function publicConfig(cfg) {
  return {
    sampleMode: cfg.sampleMode,
    models: cfg.sampleMode ? null : { reasoning: cfg.nebius.reasoningModel, fast: cfg.nebius.fastModel || cfg.nebius.reasoningModel },
    tavily: cfg.sampleMode ? false : !!cfg.tavilyKey,
    samples: loadSamples().map((s) => ({ id: s.id, input: s.input, blurb: s.blurb })),
  };
}

/** Returns { io, brain } for one run, or { error }. */
export function wiringFor(cfg, query, { fetchImpl } = {}) {
  if (cfg.sampleMode) {
    const sample = findSample(loadSamples(), query);
    if (!sample) return { error: 'Sample mode knows three fictional businesses. Pick one of the examples, or add keys for live mode.' };
    return { io: createSampleIO(sample), brain: createSampleBrain(sample), query: sample.input };
  }
  const llm = createTokenFactoryClient({ ...cfg.nebius, fetchImpl });
  const tavily = cfg.tavilyKey ? createTavilyClient({ apiKey: cfg.tavilyKey, fetchImpl }) : null;
  return {
    io: createRealIO({ tavily, nominatimContact: cfg.nominatimContact, fetchImpl }),
    brain: createNemotronBrain(llm),
    query,
  };
}
