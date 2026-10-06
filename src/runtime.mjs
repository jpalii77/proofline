// Picks sample or live wiring from environment variables. Keys are read from process.env only;
// they are never logged, returned to the browser or written anywhere.

import { createNemotronBrain } from './agent/nemotron-brain.mjs';
import { createSampleBrain } from './agent/sample-brain.mjs';
import { createNodeNet } from './io/net-node.mjs';
import { createRealIO } from './io/real.mjs';
import { createSampleIO, findSample, loadSamples } from './io/sample.mjs';
import { createTokenFactoryClient, DEFAULT_BASE_URL, DEFAULT_REASONING_MODEL } from './llm.mjs';
import { createTavilyClient } from './tavily.mjs';

const REQUIRED_LIVE_KEYS = ['NEBIUS_API_KEY', 'TAVILY_API_KEY'];

/**
 * SAMPLE_MODE=true  -> recorded data, no keys, no network.
 * anything else     -> live mode, which needs NEBIUS_API_KEY and TAVILY_API_KEY.
 * Live mode never falls back silently: `missing` lists absent keys and callers refuse to start.
 */
export function readConfig(env = process.env) {
  const sampleMode = ['true', '1', 'yes'].includes(String(env.SAMPLE_MODE ?? '').trim().toLowerCase());
  return {
    sampleMode,
    missing: sampleMode ? [] : REQUIRED_LIVE_KEYS.filter((k) => !String(env[k] ?? '').trim()),
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

/** A clear, key-free explanation of why live mode cannot start, or null when it can. */
export function configProblem(cfg) {
  if (cfg.sampleMode || !cfg.missing.length) return null;
  return [
    `Live mode needs ${cfg.missing.join(' and ')} in the environment (not set).`,
    'Export them in your shell (see .env.example), or try the app without keys:',
    '  npm run sample        (same as SAMPLE_MODE=true npm start)',
  ].join('\n');
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
export function wiringFor(cfg, query, { fetchImpl, pace = false } = {}) {
  if (cfg.sampleMode) {
    const sample = findSample(loadSamples(), query);
    if (!sample) return { error: 'Sample mode knows four fictional businesses. Pick one of the examples, or add keys for live mode.' };
    return {
      io: createSampleIO(sample, { latency: pace ? [60, 240] : null }),
      brain: createSampleBrain(sample, { thinkMs: pace ? 650 : 0 }),
      query: sample.input,
    };
  }
  const problem = configProblem(cfg);
  if (problem) return { error: problem };
  const llm = createTokenFactoryClient({ ...cfg.nebius, fetchImpl });
  const tavily = cfg.tavilyKey ? createTavilyClient({ apiKey: cfg.tavilyKey, fetchImpl }) : null;
  return {
    io: createRealIO({ net: createNodeNet(), tavily, nominatimContact: cfg.nominatimContact, fetchImpl }),
    brain: createNemotronBrain(llm),
    query,
  };
}
