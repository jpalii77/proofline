// Can this key use NVIDIA Nemotron 3 Ultra on Token Factory, and what does one hard identity decision cost?
//   NEBIUS_API_KEY=... node scripts/ultra-probe.mjs [model-id]
// Finds the Ultra model id (or uses the one given), then asks the same ambiguous identity question twice:
// once to Ultra, once to Super, each with the planner's strict JSON Schema. Prints the answer, latency,
// tokens and output format of each, so we can decide where Ultra is worth its price. 2 small calls in total.
import { SCHEMAS } from '../src/agent/nemotron-brain.mjs';
import { createTokenFactoryClient, DEFAULT_REASONING_MODEL } from '../src/llm.mjs';

const apiKey = process.env.NEBIUS_API_KEY;
if (!apiKey) { console.error('Set NEBIUS_API_KEY first.'); process.exit(1); }
const baseUrl = process.env.NEBIUS_BASE_URL || undefined;

const ids = await createTokenFactoryClient({ apiKey, baseUrl }).listModels();
const ultra = process.argv[2] || ids.find((id) => /nemotron/i.test(id) && /ultra/i.test(id));
console.log(`Nemotron models on this key:\n  ${ids.filter((id) => /nemotron/i.test(id)).join('\n  ') || '(none)'}\n`);
if (!ultra) { console.log('No Nemotron Ultra model found for this key. Nothing else was called.'); process.exit(0); }

// The kind of case Ultra is meant for: a bare one-word name, results that name several different companies.
const grounding = { domains: ['shout.com.tr', 'shout-tv.com', 'shoutoutdoor.com'], phones: [] };
const results = [
  { title: 'SHOUT – Oversize Giyim, Unisex Stil ve Sokak Modası', url: 'https://shout.com.tr/', content: 'Oversize t-shirt, hoodie ve sokak modası. Türkiye geneli kargo.' },
  { title: 'Shout! TV – Stream classic movies and TV', url: 'https://www.shout-tv.com/', content: 'Watch cult classics, horror and TV series. Free trial.' },
  { title: 'Shout Outdoor Media | Billboards', url: 'https://shoutoutdoor.com/', content: 'Outdoor advertising and billboard company.' },
];
const system = `You identify a small business from a user query and web search results. Reply with one JSON object only. Never invent facts.
Pick the business's own website domain ONLY from the allowed list, or null if the query alone cannot tell which business is meant.
Schema: {"name": string|null, "city": string|null, "domain": string|null, "phone": string|null, "reasoning": string (max 2 sentences)}`;
const user = { query: 'Shout', note: 'The user is a Turkish freelancer researching Turkish small businesses.', allowed_domains: grounding.domains, allowed_phones: [], search_results: results };

for (const model of [ultra, process.env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL]) {
  const llm = createTokenFactoryClient({ apiKey, baseUrl, reasoningModel: model });
  try {
    const r = await llm.chat({ tier: 'reasoning', schema: SCHEMAS.plan({ grounding }), maxTokens: 2500, system, user });
    const u = r.usage || {};
    console.log(`${model}\n  answer: domain=${r.json.domain} · ${r.json.reasoning}\n  ${r.ms} ms · ${u.in ?? '?'} in + ${u.out ?? '?'} out tokens${u.reasoning != null ? ` (${u.reasoning} reasoning)` : ''} · format ${r.format}\n`);
  } catch (e) {
    console.log(`${model}\n  failed: ${String(e.message || e).slice(0, 300)}\n`);
  }
}
console.log('Prices per token are on the Token Factory model page; multiply by the token counts above.');
