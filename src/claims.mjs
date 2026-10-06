// Claim catalog and the claim gate.
//
// The model may only assert claims from this catalog. Every claim type names the checks that
// must come back with an exact result for the claim to survive. The gate re-runs those checks
// itself, against a fresh observation; the model's word is never enough.

import { runCheck } from './checks.mjs';

// Every claim about "the business's website" first re-proves that the domain IS its website:
// not a listing platform, and tied to the business by its own page or by search results.
// A rename claim needs the stronger tie (search results), since a name mismatch on an
// unverified domain usually just means it is somebody else's site.
const ownSite = (c, extra = {}) => ({
  check: 'site.own_site',
  params: { host: c.domain, name: c.name || null, city: c.city || null, query: c.searchQuery || null, userGiven: !!c.userGivenDomain, ...extra },
  expect: true,
});

/**
 * Each type:
 *   area      which part of the health card it affects
 *   tone      'good' | 'issue' | 'risk' (risk = uncertain but worth a human look)
 *   needs     ctx fields required to build the proof
 *   proof     ctx -> [{ check, params, expect }]
 *   statement ctx -> plain sentence (for the seller)
 */
export const CLAIM_TYPES = {
  site_online: {
    area: 'reach', tone: 'good', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'http.reachable', params: { url: `https://${c.domain}/` }, expect: true },
      { check: 'page.not_parked', params: { url: `https://${c.domain}/` }, expect: true },
    ],
    statement: (c) => `${c.domain} loads and shows real content.`,
  },
  site_unreachable: {
    area: 'reach', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'http.reachable', params: { url: `https://${c.domain}/` }, expect: false },
    ],
    statement: (c) => `${c.domain} does not load (two attempts failed).`,
  },
  domain_parked: {
    area: 'reach', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'http.reachable', params: { url: `https://${c.domain}/` }, expect: true },
      { check: 'page.not_parked', params: { url: `https://${c.domain}/` }, expect: false },
    ],
    statement: (c) => `${c.domain} shows a parked, for-sale or placeholder page instead of the business.`,
  },
  https_healthy: {
    area: 'security', tone: 'good', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'tls.cert_valid', params: { host: c.domain, minDays: 30 }, expect: true },
      { check: 'http.https_redirect', params: { host: c.domain }, expect: true },
    ],
    statement: (c) => `${c.domain} has a valid certificate for 30+ days and sends visitors to HTTPS.`,
  },
  ssl_expiring_soon: {
    area: 'security', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'tls.cert_valid', params: { host: c.domain, minDays: 0 }, expect: true },
      { check: 'tls.cert_valid', params: { host: c.domain, minDays: 30 }, expect: false },
    ],
    statement: (c) => `The security certificate of ${c.domain} expires within 30 days.`,
  },
  ssl_invalid: {
    area: 'security', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'tls.cert_valid', params: { host: c.domain, minDays: 0 }, expect: false },
    ],
    statement: (c) => `The security certificate of ${c.domain} is expired or invalid; browsers show a warning.`,
  },
  no_https_redirect: {
    area: 'security', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'http.https_redirect', params: { host: c.domain }, expect: false },
    ],
    statement: (c) => `Typing ${c.domain} without https keeps visitors on an insecure connection.`,
  },
  no_contact_path: {
    area: 'contact', tone: 'issue', needs: ['domain'],
    proof: (c) => [
      ownSite(c),
      { check: 'page.contact_path', params: { url: `https://${c.domain}/` }, expect: false },
    ],
    statement: () => 'The homepage has no contact form, email link, tap-to-call or WhatsApp link.',
  },
  phone_confirmed: {
    area: 'contact', tone: 'good', needs: ['domain', 'phone'],
    proof: (c) => [
      ownSite(c),
      { check: 'page.phone_listed', params: { url: `https://${c.domain}/`, phone: c.phone }, expect: true },
    ],
    statement: (c) => `${c.phone} is the business's own number: it is listed on its website.`,
  },
  phone_unconfirmed: {
    area: 'contact', tone: 'risk', needs: ['domain', 'phone'],
    proof: (c) => [
      ownSite(c),
      { check: 'http.reachable', params: { url: `https://${c.domain}/` }, expect: true },
      { check: 'page.phone_listed', params: { url: `https://${c.domain}/`, phone: c.phone }, expect: false },
    ],
    statement: (c) => `${c.phone} (from listings) is not on the business's own site; it may be outdated.`,
  },
  no_own_website: {
    area: 'reach', tone: 'issue', needs: ['name'],
    proof: (c) => [
      { check: 'web.own_site_found', params: { name: c.name, city: c.city || null, query: c.searchQuery || null }, expect: false },
    ],
    statement: (c) => `No website of its own was found for ${c.name}; it shows up only on listings and platforms.`,
  },
  on_map: {
    area: 'presence', tone: 'good', needs: ['name'],
    proof: (c) => [
      { check: 'osm.listed', params: { name: c.name, city: c.city }, expect: true },
    ],
    statement: (c) => `${c.name} is listed on OpenStreetMap.`,
  },
  not_on_map: {
    area: 'presence', tone: 'issue', needs: ['name'],
    proof: (c) => [
      { check: 'osm.listed', params: { name: c.name, city: c.city }, expect: false },
    ],
    statement: (c) => `${c.name} is missing from OpenStreetMap, which many map apps reuse.`,
  },
  possibly_closed: {
    area: 'presence', tone: 'risk', needs: ['name'],
    proof: (c) => [
      { check: 'web.no_closure_signal', params: { name: c.name, city: c.city }, expect: false },
    ],
    statement: (c) => `A public page says ${c.name} may have closed. Confirm before reaching out.`,
  },
  possibly_renamed: {
    area: 'presence', tone: 'risk', needs: ['domain', 'name'],
    proof: (c) => [
      ownSite(c, { needSearchTie: true }),
      { check: 'http.reachable', params: { url: `https://${c.domain}/` }, expect: true },
      { check: 'page.not_parked', params: { url: `https://${c.domain}/` }, expect: true },
      { check: 'page.name_match', params: { url: `https://${c.domain}/`, name: c.name }, expect: false },
    ],
    statement: (c) => `The site at ${c.domain} uses a different name than “${c.name}”; the business may have been renamed or changed hands.`,
  },
};

export function catalogForPrompt() {
  return Object.entries(CLAIM_TYPES).map(([type, t]) => ({ type, area: t.area, tone: t.tone, needs: t.needs }));
}

/** Build a concrete claim (statement + proof plan) from a type and the business context. */
export function buildClaim(type, ctx, extra = {}) {
  const t = CLAIM_TYPES[type];
  if (!t) return { ok: false, reason: `“${type}” is not in the claim catalog` };
  const missing = t.needs.filter((k) => !ctx[k]);
  if (missing.length) return { ok: false, reason: `missing ${missing.join(', ')}` };
  return {
    ok: true,
    claim: {
      id: extra.id || type,
      type,
      area: t.area,
      tone: t.tone,
      statement: t.statement(ctx),
      rationale: extra.rationale || '',
      proposedBy: extra.proposedBy || 'agent',
      proof: t.proof(ctx),
    },
  };
}

/**
 * The gate. Re-runs every check in the claim's proof on `io` and keeps the claim only if each
 * result equals its expectation. Inconclusive (null) never counts as a match.
 */
export async function gateClaim(io, claim) {
  const results = [];
  for (const step of claim.proof) {
    const r = await runCheck(io, step.check, step.params);
    results.push({ ...r, expect: step.expect, matched: r.pass === step.expect });
  }
  const failed = results.filter((r) => !r.matched);
  return {
    ...claim,
    verdict: failed.length ? 'dropped' : 'verified',
    evidence: results,
    dropReason: failed.length
      ? failed.map((f) => (f.pass === null ? `${f.title}: inconclusive (${f.summary})` : `${f.title}: expected ${f.expect ? 'pass' : 'fail'}, got ${f.pass ? 'pass' : 'fail'} — ${f.summary}`)).join('; ')
      : null,
    checkedAt: new Date().toISOString(),
  };
}
