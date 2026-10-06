// The live brain: four prompts to NVIDIA Nemotron on Nebius Token Factory.
//   plan / propose / write  -> reasoning tier (Nemotron 3 Super by default)
//   verify                  -> fast tier (set NEBIUS_FAST_MODEL to a Nemotron Nano ID)
// Every prompt asks for strict JSON and every answer is checked by code afterwards.

const RULES = 'Reply with one JSON object only. No markdown. Never invent facts, domains, phone numbers or numbers.';

export function createNemotronBrain(llm) {
  return {
    models: { reasoning: llm.models.reasoning, fast: llm.models.fast, provider: 'Nebius Token Factory' },

    plan: ({ query, parsed, discovery, grounding }) => llm.chat({
      tier: 'reasoning',
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

    propose: ({ ctx, observations, catalog }) => llm.chat({
      tier: 'reasoning',
      maxTokens: 1500,
      system: `You are an auditor proposing claims about a business's web presence. ${RULES}
You may only use claim types from the catalog. Propose every claim the observations support, good or bad.
A code gate will re-run the checks behind each claim; claims that fail are dropped and shown as dropped, so do not pad.
business.ownSite=false means no website of the business's own was confirmed: do not propose website, security or contact-on-site claims;
if web.own_site_found failed, propose no_own_website.
Schema: {"claims": [{"type": catalog type, "rationale": string citing the observation}]}`,
      user: { business: ctx, catalog, observations: observations.map((o) => ({ check: o.check, params: o.params, pass: o.pass, summary: o.summary })) },
    }),

    verify: ({ ctx, claims }) => llm.chat({
      tier: 'fast',
      system: `Rewrite each verified claim as one short, friendly sentence for the business owner (no jargon). ${RULES}
Do not add numbers, dates or facts not in the claim or its evidence. Schema: {"claims": [{"id": string, "owner_text": string}]}`,
      user: { business: ctx.name || ctx.domain, claims },
    }),

    write: ({ ctx, claims }) => llm.chat({
      tier: 'reasoning',
      maxTokens: 1400,
      system: `You write two things from VERIFIED claims only. ${RULES}
1) owner_summary: 2-3 plain sentences for the owner about their digital health.
2) pitch: a short, honest outreach draft from a web freelancer. Each finding must cite claim ids it relies on.
Schema: {"owner_summary": string, "pitch": {"subject": string, "opening": string, "findings": [{"text": string, "cites": [claim id]}], "offer": string, "closing": string}}`,
      user: { business: ctx, verified_claims: claims },
    }),
  };
}
