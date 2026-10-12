// The live brain: four prompts to NVIDIA Nemotron on Nebius Token Factory.
//   plan / propose / write  -> reasoning tier (Nemotron 3 Super by default)
//   verify                  -> fast tier (set NEBIUS_FAST_MODEL to a Nemotron Nano ID)
// Every prompt sends a JSON Schema (structured output) and every answer is checked by code afterwards.

// Reply budgets. Nemotron thinks before it answers and the thinking counts against max_tokens: on
// 11 Oct 2026 the Nano rewrite used ~1,100 of 1,200 tokens in English and ran out (empty reply) on
// 2 of 4 Turkish runs; the Turkish writer used 1,394 of 1,400. Room to finish, still capped.
// The planner budget went from 1,200 to 2,000 after Nemotron 3 Ultra ran out on one of 12 plans (12 Oct).
export const MAX_TOKENS = { plan: 2000, propose: 2000, verify: 2500, write: 2400 };

const RULES = 'Reply with one JSON object only. No markdown. Never invent facts, domains, phone numbers or numbers.';

// The words people read (owner lines, summary, pitch) follow the language picked on the page.
// JSON keys, claim ids, domains, phone numbers and business names are never translated.
const LANGUAGE = { en: 'English', tr: 'Turkish' };
export function languageRule(lang) {
  const name = LANGUAGE[lang] || LANGUAGE.en;
  return lang === 'tr'
    ? `Write every text value in ${name} (natural, everyday Turkish; use "siz"). Keep JSON keys, claim ids, domains, phone numbers and names exactly as given.`
    : `Write every text value in ${name}.`;
}

// Structured output: each call sends a JSON Schema (response_format json_schema), so the reply is
// decoded into that shape. Enums hold the model to what it may pick: a domain or phone from the search
// results, a claim type from the catalog, a claim id that exists. Code still checks every answer after.
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };
/** A string from `values`, or null. With no values, only null. */
export const oneOfOrNull = (values) => {
  const list = [...new Set((values || []).filter((v) => typeof v === 'string' && v))];
  return list.length ? { type: ['string', 'null'], enum: [...list, null] } : { type: 'null' };
};
/** A list of ids from `ids` (empty list when there are none). */
const idList = (ids) => (ids.length ? { type: 'array', items: { type: 'string', enum: ids } } : { type: 'array', maxItems: 0 });

export const SCHEMAS = {
  plan: ({ grounding }) => ({
    name: 'business_identity',
    schema: obj({ name: { type: ['string', 'null'] }, city: { type: ['string', 'null'] }, domain: oneOfOrNull(grounding?.domains), phone: oneOfOrNull(grounding?.phones), reasoning: str }),
  }),
  propose: ({ catalog }) => ({
    name: 'claim_proposals',
    schema: obj({ claims: { type: 'array', items: obj({ type: { type: 'string', enum: (catalog || []).map((c) => c.type) }, rationale: str }) } }),
  }),
  verify: ({ claims }) => ({
    name: 'owner_lines',
    schema: obj({ claims: { type: 'array', items: obj({ id: { type: 'string', enum: (claims || []).map((c) => c.id) }, owner_text: str }) } }),
  }),
  write: ({ claims }) => ({
    name: 'summary_and_pitch',
    schema: obj({
      owner_summary: str,
      pitch: obj({ subject: str, opening: str, findings: { type: 'array', items: obj({ text: str, cites: idList((claims || []).map((c) => c.id)) }) }, offer: str, closing: str }),
    }),
  }),
};

export function createNemotronBrain(llm) {
  return {
    models: { reasoning: llm.models.reasoning, fast: llm.models.fast, provider: 'Nebius Token Factory' },

    plan: ({ query, parsed, discovery, grounding }) => llm.chat({
      tier: 'reasoning',
      maxTokens: MAX_TOKENS.plan,
      schema: SCHEMAS.plan({ grounding }),
      system: `You identify a small business from a user query and web search results. ${RULES}
Pick the business's own website domain and its main phone ONLY from the allowed lists. If unsure, use null.
A listing is not a website: never pick a QR-menu/menu provider, delivery app, directory, review site, map, social network or link hub
(e.g. menulio, yemeksepeti, tripadvisor, google maps, instagram, linktr.ee) as "domain". If the business only has listings, domain is null.
"domain" must be a web address shown in the results (a result URL or an address like name.com.tr in the text). Address abbreviations
("A.Ayrancı"), @handles, emails and file names are not domains.
Code re-checks this choice and ignores a domain that is a platform or does not identify the business.
Schema: {"name": string|null, "city": string|null, "domain": string|null, "phone": string|null, "reasoning": string (max 2 sentences)}`,
      user: {
        query, parsed,
        allowed_domains: grounding.domains,
        allowed_phones: grounding.phones,
        search_results: discovery.map((r) => ({ title: r.title, url: r.url, content: r.content })),
      },
    }),

    propose: ({ ctx, observations, catalog, lang }) => llm.chat({
      tier: 'reasoning',
      schema: SCHEMAS.propose({ catalog }),
      maxTokens: MAX_TOKENS.propose,
      system: `You are an auditor proposing claims about a business's web presence. ${RULES}
You may only use claim types from the catalog. Propose every claim the observations support, good or bad.
A code gate will re-run the checks behind each claim; claims that fail are dropped and shown as dropped, so do not pad.
business.ownSite=false means no website of the business's own was confirmed: do not propose website, security or contact-on-site claims;
if web.own_site_found failed, propose no_own_website.
${lang === 'tr' ? 'Write each rationale in Turkish; keep claim types, domains, phone numbers and names exactly as given.\n' : ''}Schema: {"claims": [{"type": catalog type, "rationale": string citing the observation}]}`,
      user: { business: ctx, catalog, observations: observations.map((o) => ({ check: o.check, params: o.params, pass: o.pass, summary: o.summary })) },
    }),

    verify: ({ ctx, claims, lang }) => llm.chat({
      tier: 'fast',
      maxTokens: MAX_TOKENS.verify,
      schema: SCHEMAS.verify({ claims }),
      system: `Rewrite each verified claim as one short, friendly sentence for the business owner (no jargon). ${RULES}
${languageRule(lang)}
Do not add numbers, dates or facts not in the claim or its evidence. Schema: {"claims": [{"id": string, "owner_text": string}]}`,
      user: { business: ctx.displayName || ctx.name || ctx.domain, claims },
    }),

    write: ({ ctx, claims, lang }) => llm.chat({
      tier: 'reasoning',
      schema: SCHEMAS.write({ claims }),
      maxTokens: MAX_TOKENS.write,
      system: `You write two things from VERIFIED claims only. ${RULES}
${languageRule(lang)}
1) owner_summary: 2-3 plain sentences for the owner about their digital health.
2) pitch: a short, honest outreach draft from a web freelancer. Each finding must cite claim ids it relies on.
Schema: {"owner_summary": string, "pitch": {"subject": string, "opening": string, "findings": [{"text": string, "cites": [claim id]}], "offer": string, "closing": string}}`,
      user: { business: ctx, verified_claims: claims },
    }),
  };
}
