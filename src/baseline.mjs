// Two comparisons against the full agent (scripts/model-alone.mjs, scripts/accuracy-run.mjs --no-tavily):
//   1. "Model alone": Nemotron writes the profile from what it remembers, with no search and no checks.
//   2. "No Tavily": the full agent with web search turned off, so only the query and live checks remain.
// Nothing here changes how the agent itself runs.

import { catalogForPrompt } from './claims.mjs';
import { registrable } from './checks.mjs';
import { normalizeHost } from './text.mjs';

export const TAVILY_OFF = 'Tavily is turned off for this comparison';

/** The same I/O with web search turned off: every search answers with an error, as when Tavily is down. */
export function withoutSearch(io) {
  return new Proxy(io, {
    get(target, key, receiver) {
      if (key === 'search') return async () => ({ results: [], error: TAVILY_OFF });
      return Reflect.get(target, key, receiver);
    },
  });
}

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const maybe = { type: ['string', 'null'] };

/** The question asked of the model alone: the same claim catalog, no observations, no search results. */
export function aloneRequest(query, catalog = catalogForPrompt()) {
  return {
    tier: 'reasoning',
    maxTokens: 2000,
    schema: {
      name: 'profile_from_memory',
      schema: obj({
        name: maybe, city: maybe, website: maybe, phone: maybe,
        claims: { type: 'array', items: obj({ type: { type: 'string', enum: catalog.map((c) => c.type) }, rationale: { type: 'string' } }) },
      }),
    },
    system: `You profile a small business's web presence for a web freelancer. You have no web access: answer from what you know.
Reply with one JSON object only. No markdown. Never invent facts, domains, phone numbers or numbers; use null when you do not know.
website: the business's own website domain (e.g. name.com.tr), or null. phone: its main phone, or null. city: where it is, or null.
claims: claim types from the catalog that you believe are true of this business today, each with a one-sentence rationale.
Schema: {"name": string|null, "city": string|null, "website": string|null, "phone": string|null, "claims": [{"type": catalog type, "rationale": string}]}`,
    user: { query, catalog },
  };
}

/** Scores the model's website answer against the known own site ("none" when the business has no site). */
export function scoreWebsite(answer, truth) {
  const host = answer ? normalizeHost(String(answer)) : null;
  if (!host) return truth.site === 'none' ? 'abstained (right: it has no site)' : 'abstained';
  if (truth.site === 'none') return 'wrong (it has no site of its own)';
  const own = [truth.site, ...(truth.alsoOwn || [])].map((h) => registrable(normalizeHost(h)));
  return own.includes(registrable(host)) ? 'right' : 'wrong';
}
