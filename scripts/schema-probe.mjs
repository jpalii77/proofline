// One tiny structured-output call per Nemotron model, to see whether Token Factory accepts the JSON
// Schema (response_format json_schema) or the client had to fall back to plain JSON mode.
//   NEBIUS_API_KEY=... [NEBIUS_FAST_MODEL=...] node scripts/schema-probe.mjs
import { oneOfOrNull } from '../src/agent/nemotron-brain.mjs';
import { createTokenFactoryClient, DEFAULT_REASONING_MODEL } from '../src/llm.mjs';

const llm = createTokenFactoryClient({
  apiKey: process.env.NEBIUS_API_KEY,
  baseUrl: process.env.NEBIUS_BASE_URL || undefined,
  reasoningModel: process.env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL,
  fastModel: process.env.NEBIUS_FAST_MODEL,
});
const allowed = ['lumencoffee.com.tr', 'menulio.com'];
const schema = {
  name: 'probe',
  schema: { type: 'object', properties: { domain: oneOfOrNull(allowed) }, required: ['domain'], additionalProperties: false },
};
for (const tier of ['reasoning', 'fast']) {
  try {
    const r = await llm.chat({
      tier, schema, maxTokens: 400,
      system: 'Pick the business\'s own website from the allowed list, or null. Reply with JSON {"domain": ...}.',
      user: { business: 'Lumen Coffee Roasters, Izmir', allowed },
    });
    const ok = r.json.domain === null || allowed.includes(r.json.domain);
    console.log(`${tier.padEnd(9)} ${r.model}\n          format: ${r.format} · answer: ${JSON.stringify(r.json)} · ${ok ? 'within the allowed list' : 'OUTSIDE the allowed list'} · ${r.ms} ms`);
  } catch (e) {
    console.log(`${tier.padEnd(9)} failed: ${e.message}`);
  }
}
