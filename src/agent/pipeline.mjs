// The agent loop: intake → discover → plan → gather → propose → gate → verify → write.
//
// The model decides (what the business is, which claims to assert, how to phrase them).
// Code proves (every claim is re-checked by the gate before it can reach the report).
// Every step is emitted as a trace event so the UI can show why each line is true.

import { CHECKS, discoveryQuery, runCheck } from '../checks.mjs';
import { buildClaim, catalogForPrompt, gateClaim } from '../claims.mjs';
import { observed } from '../io/observed.mjs';
import { domainsIn, extractPhones, looksLikeDomain, normalizeHost, phoneKey } from '../text.mjs';
import { gradeCard } from './card.mjs';

/** Parse "Name, City" or a bare domain. */
export function intake(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return { error: 'Enter a business name or a domain.' };
  if (looksLikeDomain(q)) return { raw: q, domain: normalizeHost(q) };
  const [name, ...rest] = q.split(',').map((s) => s.trim()).filter(Boolean);
  return { raw: q, name, city: rest.join(', ') || null };
}

/** Domains and phones that appear in search results: the only values the planner may pick. */
export function groundingFrom(parsed, discovery) {
  const domains = new Set();
  const phones = new Set();
  if (parsed.domain) domains.add(parsed.domain);
  for (const r of discovery?.results || []) {
    const h = normalizeHost(r.url);
    if (h) domains.add(h);
    for (const d of domainsIn(`${r.title} ${r.content}`)) domains.add(d);
    for (const p of extractPhones(`${r.title} ${r.content}`)) phones.add(p);
  }
  return { domains: [...domains], phones: [...phones] };
}

function observationPlan(ctx) {
  const plan = [];
  if (ctx.domain && ctx.ownSite) {
    const url = `https://${ctx.domain}/`;
    plan.push(['dns.resolves', { host: ctx.domain }]);
    plan.push(['http.reachable', { url }]);
    plan.push(['http.https_redirect', { host: ctx.domain }]);
    plan.push(['tls.cert_valid', { host: ctx.domain, minDays: 30 }]);
    plan.push(['page.not_parked', { url }]);
    plan.push(['page.contact_path', { url }]);
    if (ctx.name) plan.push(['page.name_match', { url, name: ctx.name }]);
    if (ctx.phone) plan.push(['page.phone_listed', { url, phone: ctx.phone }]);
  }
  if (ctx.name) {
    plan.push(['osm.listed', { name: ctx.name, city: ctx.city }]);
    plan.push(['web.no_closure_signal', { name: ctx.name, city: ctx.city }]);
  }
  return plan;
}

/** Keep only words the owner can verify: numbers in a rewrite must already exist in the evidence. */
export function numbersGrounded(text, claim) {
  const evidenceText = `${claim.statement} ${claim.evidence.map((e) => e.summary).join(' ')}`;
  const known = new Set(evidenceText.match(/\d+/g) || []);
  return (String(text).match(/\d+/g) || []).every((n) => known.has(n));
}

export async function runAgent({ query, io, brain, emit = () => {}, now = () => Date.now() }) {
  const t0 = now();
  const step = (type, data) => emit({ t: now() - t0, ...data, type });
  const toolLog = (phase) => (c) => step('tool', { phase, tool: c.tool, args: c.args, ms: c.ms, error: c.error });

  step('start', { query, mode: io.mode, models: brain.models });

  // 1. Intake
  const parsed = intake(query);
  if (parsed.error) { step('error', { message: parsed.error }); return { error: parsed.error }; }
  step('intake', { parsed });

  // 2. Discover with Tavily (runtime web search)
  const gatherIO = observed(io, toolLog('gather'));
  const searchQuery = discoveryQuery(parsed);
  const discovery = await gatherIO.search(searchQuery, { purpose: 'discover' });
  step('discover', {
    query: searchQuery,
    results: (discovery.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content })),
    error: discovery.error || null,
  });
  const grounding = groundingFrom(parsed, discovery);

  // 3. Plan (reasoning model): who is this business, which domain and phone are theirs?
  const planOut = await brain.plan({ query, parsed, discovery: discovery.results || [], grounding });
  const plan = planOut.json || {};
  const ctx = {
    name: plan.name || parsed.name || null,
    city: plan.city || parsed.city || null,
    domain: normalizeHost(plan.domain) || parsed.domain || null,
    phone: plan.phone || null,
    searchQuery,
  };
  // Grounding guard: the model may choose, never invent.
  const guard = [];
  if (ctx.domain && !grounding.domains.includes(ctx.domain)) { guard.push(`domain ${ctx.domain} not seen in input or search results`); ctx.domain = parsed.domain || null; }
  if (ctx.phone && !grounding.phones.includes(phoneKey(ctx.phone))) { guard.push(`phone ${ctx.phone} not seen in search results`); ctx.phone = null; }
  ctx.userGivenDomain = !!(parsed.domain && ctx.domain === parsed.domain);

  if (!ctx.domain && !ctx.name) {
    step('plan', { model: planOut.model, ms: planOut.ms, reasoning: plan.reasoning || '', ctx, guard });
    step('error', { message: 'Could not identify the business. Try “Name, City” or a domain.' });
    return { error: 'unidentified' };
  }

  // Own-site guard: a domain is the business's website only if it is not a listing platform and
  // the evidence ties it to the business. Otherwise no site-dependent check runs against it.
  const observations = [];
  ctx.ownSite = false;
  if (ctx.domain) {
    const own = await runCheck(gatherIO, 'site.own_site', { host: ctx.domain, name: ctx.name, city: ctx.city, query: searchQuery, userGiven: ctx.userGivenDomain });
    observations.push(own);
    if (own.pass === true) ctx.ownSite = true;
    else guard.push(`${own.summary} — website checks skipped`);
  }
  if (!ctx.ownSite && ctx.name) {
    const found = await runCheck(gatherIO, 'web.own_site_found', { name: ctx.name, city: ctx.city, query: searchQuery });
    observations.push(found);
    const alt = found.pass === true ? found.observed.host : null;
    if (alt && alt !== ctx.domain && grounding.domains.includes(alt)) {
      guard.push(`using ${alt} instead: ${found.summary}`);
      ctx.domain = alt;
      ctx.ownSite = true;
    }
  }
  step('plan', { model: planOut.model, ms: planOut.ms, reasoning: plan.reasoning || '', ctx, guard });

  // 4. Gather observations
  for (const r of observations) step('observe', { check: r.check, title: r.title, params: r.params, pass: r.pass, summary: r.summary });
  for (const [id, params] of observationPlan(ctx)) {
    const r = await runCheck(gatherIO, id, params);
    observations.push(r);
    step('observe', { check: id, title: CHECKS[id].title, params, pass: r.pass, summary: r.summary });
  }

  // 5. Propose claims (reasoning model), only from the catalog
  const proposeOut = await brain.propose({ ctx, observations, catalog: catalogForPrompt(), discovery: discovery.results || [] });
  const proposals = Array.isArray(proposeOut.json?.claims) ? proposeOut.json.claims.slice(0, 16) : [];
  const claims = [];
  const rejected = [];
  const seen = new Set();
  for (const p of proposals) {
    if (seen.has(p.type)) continue;
    seen.add(p.type);
    const b = buildClaim(p.type, ctx, { rationale: p.rationale, proposedBy: proposeOut.model });
    if (b.ok) claims.push(b.claim); else rejected.push({ type: p.type, reason: b.reason });
  }
  // "No own website" is a finding in its own right: if the evidence says so, it is put to the gate
  // even when the model did not propose it.
  const noSite = observations.find((o) => o.check === 'web.own_site_found' && o.pass === false);
  if (noSite && !seen.has('no_own_website')) {
    const b = buildClaim('no_own_website', ctx, { rationale: noSite.summary, proposedBy: 'code (own-site guard)' });
    if (b.ok) claims.push(b.claim);
  }
  step('propose', { model: proposeOut.model, ms: proposeOut.ms, claims: claims.map((c) => ({ id: c.id, type: c.type, statement: c.statement, rationale: c.rationale })), rejected });

  // 6. Gate: re-observe from scratch and keep only claims whose proof holds
  const gateIO = observed(io, toolLog('gate'));
  const gated = [];
  for (const c of claims) {
    const g = await gateClaim(gateIO, c);
    gated.push(g);
    step('gate', { id: g.id, claimType: g.type, verdict: g.verdict, statement: g.statement, dropReason: g.dropReason, evidence: g.evidence.map((e) => ({ check: e.check, title: e.title, expect: e.expect, pass: e.pass, matched: e.matched, summary: e.summary })) });
  }
  const verified = gated.filter((g) => g.verdict === 'verified');
  const dropped = gated.filter((g) => g.verdict === 'dropped');

  // 7. Verify wording (fast model): plain-language line per claim, no new facts
  const verifyOut = await brain.verify({ ctx, claims: verified.map((c) => ({ id: c.id, type: c.type, tone: c.tone, statement: c.statement, evidence: c.evidence.map((e) => e.summary) })) });
  const ownerLines = {};
  const rewordRejected = [];
  for (const row of verifyOut.json?.claims || []) {
    const c = verified.find((v) => v.id === row.id);
    if (!c || !row.owner_text) continue;
    if (numbersGrounded(row.owner_text, c)) ownerLines[c.id] = String(row.owner_text).slice(0, 280);
    else rewordRejected.push({ id: c.id, text: row.owner_text, reason: 'introduced a number not in the evidence' });
  }
  for (const c of verified) c.ownerText = ownerLines[c.id] || c.statement;
  step('verify', { model: verifyOut.model, ms: verifyOut.ms, rewritten: Object.keys(ownerLines).length, rejected: rewordRejected });

  // 8. Write (reasoning model): owner summary + seller pitch that cites claim ids
  const writeOut = await brain.write({ ctx, claims: verified.map((c) => ({ id: c.id, type: c.type, tone: c.tone, area: c.area, statement: c.statement })) });
  const w = writeOut.json || {};
  const ids = new Set(verified.map((c) => c.id));
  const findings = [];
  const uncited = [];
  for (const f of Array.isArray(w.pitch?.findings) ? w.pitch.findings : []) {
    const cites = (f.cites || []).filter(Boolean);
    if (cites.length && cites.every((id) => ids.has(id))) findings.push({ text: String(f.text).slice(0, 300), cites });
    else uncited.push({ text: f.text, cites, reason: cites.length ? 'cites a claim that did not pass the gate' : 'no citation' });
  }
  const pitch = {
    subject: String(w.pitch?.subject || '').slice(0, 120),
    opening: String(w.pitch?.opening || '').slice(0, 400),
    findings,
    offer: String(w.pitch?.offer || '').slice(0, 400),
    closing: String(w.pitch?.closing || '').slice(0, 200),
  };
  step('write', { model: writeOut.model, ms: writeOut.ms, kept: findings.length, removed: uncited });

  const card = gradeCard(verified);
  const report = {
    ctx,
    card,
    summary: String(w.owner_summary || '').slice(0, 600),
    verified,
    dropped,
    rejected,
    pitch,
    pitchRemoved: uncited,
    stats: {
      proposed: claims.length, verified: verified.length, dropped: dropped.length,
      checksRun: observations.length + gated.reduce((n, g) => n + g.evidence.length, 0),
      ms: now() - t0,
    },
  };
  step('done', { report });
  return { report };
}

