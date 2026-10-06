// The agent loop: intake → discover → plan → gather → propose → gate → verify → write.
//
// The model decides (what the business is, which claims to assert, how to phrase them).
// Code proves (every claim is re-checked by the gate before it can reach the report).
// Every step is emitted as a trace event so the UI can show why each line is true.

import { CHECKS, discoveryQuery, runCheck } from '../checks.mjs';
import { buildClaim, catalogForPrompt, gateClaim } from '../claims.mjs';
import { displayName } from '../display-name.mjs';
import { invalidHostSentence, isValidHostname } from '../hostname.mjs';
import { observed } from '../io/observed.mjs';
import { withDeadline } from '../limits.mjs';
import { domainsIn, extractPhones, looksLikeDomain, normalizeHost, phoneKey } from '../text.mjs';
import { gradeCard } from './card.mjs';

/** Parse "Name, City" or a bare domain. */
export function intake(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return { error: 'Enter a business name or a domain.' };
  if (looksLikeDomain(q) && isValidHostname(q)) return { raw: q, domain: normalizeHost(q) };
  const [name, ...rest] = q.split(',').map((s) => s.trim()).filter(Boolean);
  return { raw: q, name, city: rest.join(', ') || null };
}

/**
 * Domains and phones that appear in search results: the only values the planner may pick.
 * A domain counts only as a web address: a result URL or an address written in the text, with a real
 * ending (see domainsIn). Text that merely looks like one (“A.Ayrancı”, an @handle) is not grounding.
 */
export function groundingFrom(parsed, discovery) {
  const domains = new Set();
  const phones = new Set();
  if (parsed.domain) domains.add(parsed.domain);
  for (const r of discovery?.results || []) {
    const h = normalizeHost(r.url);
    if (h && isValidHostname(h)) domains.add(h);
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

/** Numbers in a rewrite that do not already exist in the claim or its evidence. */
export function newNumbers(text, claim) {
  const evidenceText = `${claim.statement} ${claim.evidence.map((e) => e.summary).join(' ')}`;
  const known = new Set(evidenceText.match(/\d+/g) || []);
  return [...new Set((String(text).match(/\d+/g) || []).filter((n) => !known.has(n)))];
}

/** Keep only words the owner can verify: numbers in a rewrite must already exist in the evidence. */
export function numbersGrounded(text, claim) {
  return newNumbers(text, claim).length === 0;
}

// Which model call does what. `tier` picks the model (reasoning = Nemotron Super, fast = Nano).
export const MODEL_ROLES = {
  plan: { tier: 'reasoning', role: 'Planner', task: 'which domain and phone belong to the business' },
  propose: { tier: 'reasoning', role: 'Claim proposer', task: 'claims from the catalog, with a rationale' },
  verify: { tier: 'fast', role: 'Owner rewrite', task: 'one plain sentence per verified claim' },
  write: { tier: 'reasoning', role: 'Writer', task: 'owner summary and cited pitch' },
};

/** Totals for the run summary: "N model calls · X tokens · Y claims dropped by the gate". */
export function modelTotals(calls) {
  const known = calls.filter((c) => c.usage);
  const sum = (k) => (known.some((c) => c.usage[k] != null) ? known.reduce((n, c) => n + (c.usage[k] || 0), 0) : null);
  const tokensIn = sum('in');
  const tokensOut = sum('out');
  const total = known.some((c) => c.usage.total != null) ? known.reduce((n, c) => n + (c.usage.total ?? ((c.usage.in || 0) + (c.usage.out || 0))), 0) : null;
  return {
    calls: calls.filter((c) => !c.skipped).length,
    failed: calls.filter((c) => c.outcome === 'failed').length,
    tokensIn, tokensOut, tokens: total,
    tokensKnown: known.length,
    ms: calls.reduce((n, c) => n + (c.ms || 0), 0),
  };
}

/**
 * deadlineMs: optional wall-clock budget for the whole run (live demo). After it, network checks
 * answer "not checked" and model calls are skipped; the run still finishes with what is proven.
 */
export async function runAgent({ query, io: rawIO, brain, emit = () => {}, now = () => Date.now(), deadlineMs = null }) {
  const t0 = now();
  const deadlineAt = deadlineMs ? t0 + deadlineMs : null;
  const io = withDeadline(rawIO, deadlineAt, now);
  const step = (type, data) => emit({ t: now() - t0, ...data, type });
  const toolLog = (phase) => (c) => step('tool', { phase, tool: c.tool, args: c.args, ms: c.ms, error: c.error });
  const partial = [];
  const calls = [];

  // One model call: never throws. A failure, timeout or unreadable reply becomes { json: null,
  // error } and the step that needed it degrades (see each step below); nothing unproven is added.
  async function ask(stage, args) {
    const meta = MODEL_ROLES[stage];
    const model = brain.models?.[meta.tier] || brain.models?.reasoning || 'unknown';
    const left = deadlineAt ? deadlineAt - now() : null;
    const call = { stage, role: meta.role, tier: meta.tier, task: meta.task, model, ms: 0, usage: null, outcome: 'accepted', detail: '' };
    calls.push(call);
    if (left !== null && left <= 1000) {
      Object.assign(call, { skipped: true, outcome: 'failed', detail: 'skipped: run time limit reached' });
      return { json: null, error: call.detail, call };
    }
    const started = now();
    let timer;
    try {
      const work = Promise.resolve().then(() => brain[stage](args));
      work.catch(() => {}); // a late failure after the time limit must not become an unhandled rejection
      const out = left === null ? await work : await Promise.race([
        work,
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(`no answer before the run time limit (${Math.round(left / 1000)} s left)`), { call: { model } })), left); }),
      ]);
      Object.assign(call, { model: out.model || model, ms: out.ms ?? now() - started, usage: out.usage || null });
      return { json: out.json || {}, call };
    } catch (err) {
      Object.assign(call, {
        model: err.call?.model || model,
        ms: err.call?.ms ?? now() - started,
        usage: err.call?.usage || null,
        outcome: 'failed',
        detail: String(err.message || err).slice(0, 240),
      });
      return { json: null, error: call.detail, call };
    } finally { clearTimeout(timer); }
  }
  const modelEvent = (call) => step('model', { ...call });

  step('start', { query, mode: io.mode, models: brain.models });

  // 1. Intake
  const parsed = intake(query);
  if (parsed.error) { step('error', { message: parsed.error }); return { error: parsed.error }; }
  step('intake', { parsed });

  // 2. Discover with Tavily (runtime web search)
  const gatherIO = observed(io, toolLog('gather'));
  const searchQuery = discoveryQuery(parsed);
  const discovery = await gatherIO.search(searchQuery, { purpose: 'discover' }).catch((e) => ({ error: String(e?.message || e) }));
  step('discover', {
    query: searchQuery,
    results: (discovery.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content })),
    error: discovery.error || null,
  });
  if (discovery.error) partial.push(`Web search failed (${discovery.error}); the business was identified from the query alone.`);
  const grounding = groundingFrom(parsed, discovery);

  // 3. Plan (reasoning model): who is this business, which domain and phone are theirs?
  const planOut = await ask('plan', { query, parsed, discovery: discovery.results || [], grounding });
  const plan = planOut.json || {};
  if (planOut.error) partial.push(`Planner did not answer (${planOut.error}); code used the query and the search results instead.`);
  // Grounding guard: the model may choose, never invent. A domain must be a valid web address
  // (real ending) that the search results show as a web address; otherwise it is dropped here and
  // the reason stays in the trace.
  const guard = [];
  let domainDropped = null;
  let planned = null;
  if (plan.domain) {
    const bad = invalidHostSentence(plan.domain);
    if (bad) domainDropped = `${bad} — no own website found`;
    else planned = normalizeHost(plan.domain);
  }
  if (planned && !grounding.domains.includes(planned)) {
    domainDropped = `${planned} never appeared as a web address in the input or search results (only the model named it) — not used as the website`;
    planned = null;
  }
  if (domainDropped) guard.push(domainDropped);
  const ctx = {
    name: plan.name || parsed.name || null,
    city: plan.city || parsed.city || null,
    domain: planned || parsed.domain || null,
    phone: plan.phone || null,
    searchQuery,
  };
  if (ctx.phone && !grounding.phones.includes(phoneKey(ctx.phone))) { guard.push(`phone ${ctx.phone} not seen in search results`); ctx.phone = null; }
  const modelRemoved = guard.length;
  ctx.userGivenDomain = !!(parsed.domain && ctx.domain === parsed.domain);
  // Name for the card: the planner's proper name, else a search-result title, else the query minus the
  // city, title-cased. Display only; checks keep using ctx.name.
  ctx.displayName = (parsed.domain && !plan.name)
    ? ctx.domain
    : displayName({ raw: parsed.name || parsed.raw, planName: plan.name, city: ctx.city, results: discovery.results || [] }) || ctx.name || ctx.domain;

  const planCall = planOut.call;
  const settlePlan = () => {
    if (planCall.outcome === 'failed') return;
    const removed = guard.slice(0, modelRemoved);
    const ownSiteGuard = guard.slice(modelRemoved).filter((g) => /website checks skipped/.test(g));
    if (removed.length) Object.assign(planCall, { outcome: 'partial', detail: `guard removed: ${removed.join('; ')}` });
    else if (ownSiteGuard.length && plan.domain) Object.assign(planCall, { outcome: 'partial', detail: `own-site guard: ${ownSiteGuard.join('; ')}` });
    else planCall.detail = [ctx.domain && `domain ${ctx.domain}`, ctx.phone && `phone ${ctx.phone}`].filter(Boolean).join(' · ') || 'no domain or phone picked';
  };

  if (!ctx.domain && !ctx.name) {
    settlePlan();
    step('plan', { model: planCall.model, ms: planCall.ms, reasoning: plan.reasoning || '', ctx, guard });
    modelEvent(planCall);
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
  settlePlan();
  step('plan', { model: planCall.model, ms: planCall.ms, reasoning: plan.reasoning || '', ctx, guard });
  modelEvent(planCall);

  // 4. Gather observations
  for (const r of observations) step('observe', { check: r.check, title: r.title, params: r.params, pass: r.pass, summary: r.summary });
  for (const [id, params] of observationPlan(ctx)) {
    const r = await runCheck(gatherIO, id, params);
    observations.push(r);
    step('observe', { check: id, title: CHECKS[id].title, params, pass: r.pass, summary: r.summary });
  }

  // 5. Propose claims (reasoning model), only from the catalog
  const proposeOut = await ask('propose', { ctx, observations, catalog: catalogForPrompt(), discovery: discovery.results || [] });
  if (proposeOut.error) partial.push(`Claim proposer did not answer (${proposeOut.error}); only claims code can put to the gate by itself were checked.`);
  const proposals = Array.isArray(proposeOut.json?.claims) ? proposeOut.json.claims.slice(0, 16) : [];
  const claims = [];
  const rejected = [];
  const seen = new Set();
  for (const p of proposals) {
    if (!p || typeof p !== 'object' || seen.has(p.type)) continue;
    seen.add(p.type);
    const b = buildClaim(p.type, ctx, { rationale: p.rationale, proposedBy: proposeOut.call.model });
    if (b.ok) claims.push(b.claim);
    else rejected.push({ type: p.type, reason: domainDropped && /missing .*domain/.test(b.reason) ? `${b.reason}: ${domainDropped}` : b.reason });
  }
  // "No own website" is a finding in its own right: if the evidence says so, it is put to the gate
  // even when the model did not propose it.
  const noSite = observations.find((o) => o.check === 'web.own_site_found' && o.pass === false);
  if (noSite && !seen.has('no_own_website')) {
    const b = buildClaim('no_own_website', ctx, { rationale: noSite.summary, proposedBy: 'code (own-site guard)' });
    if (b.ok) claims.push(b.claim);
  }
  step('propose', { model: proposeOut.call.model, ms: proposeOut.call.ms, claims: claims.map((c) => ({ id: c.id, type: c.type, statement: c.statement, rationale: c.rationale })), rejected });

  // 6. Gate: re-observe from scratch and keep only claims whose proof holds
  const gateIO = observed(io, toolLog('gate'));
  const gated = [];
  for (const c of claims) {
    const g = await gateClaim(gateIO, c);
    gated.push(g);
    step('gate', { id: g.id, claimType: g.type, verdict: g.verdict, statement: g.statement, dropReason: g.dropReason, evidence: g.evidence.map((e) => ({ check: e.check, title: e.title, expect: e.expect, pass: e.pass, matched: e.matched, skipped: !!e.skipped, summary: e.summary })) });
  }
  const verified = gated.filter((g) => g.verdict === 'verified');
  const dropped = gated.filter((g) => g.verdict === 'dropped');

  const pc = proposeOut.call;
  if (pc.outcome !== 'failed') {
    const byModel = gated.filter((g) => g.proposedBy !== 'code (own-site guard)');
    const kept = byModel.filter((g) => g.verdict === 'verified').length;
    const lost = byModel.length - kept + rejected.length;
    pc.outcome = !proposals.length || !lost ? 'accepted' : kept ? 'partial' : 'rejected';
    pc.detail = `${proposals.length} proposed · ${kept} kept by the gate · ${byModel.length - kept} dropped by the gate${rejected.length ? ` · ${rejected.length} outside the catalog` : ''}`;
  }
  modelEvent(pc);

  // 7. Verify wording (fast model): plain-language line per claim, no new facts
  const ownerLines = {};
  const rewordRejected = [];
  let verifyCall = null;
  if (verified.length) {
    const verifyOut = await ask('verify', { ctx, claims: verified.map((c) => ({ id: c.id, type: c.type, tone: c.tone, statement: c.statement, evidence: c.evidence.map((e) => e.summary) })) });
    verifyCall = verifyOut.call;
    for (const row of Array.isArray(verifyOut.json?.claims) ? verifyOut.json.claims : []) {
      const c = verified.find((v) => v.id === row?.id);
      if (!c || !row.owner_text) continue;
      const extra = newNumbers(row.owner_text, c);
      if (!extra.length) ownerLines[c.id] = String(row.owner_text).slice(0, 280);
      else rewordRejected.push({ id: c.id, text: String(row.owner_text).slice(0, 280), reason: `introduced a number not in the evidence (${extra.join(', ')})` });
    }
    if (verifyOut.error) partial.push(`Owner rewrite did not answer (${verifyOut.error}); claims are shown in their checked wording.`);
    else {
      const ok = Object.keys(ownerLines).length;
      verifyCall.outcome = rewordRejected.length ? (ok ? 'partial' : 'rejected') : 'accepted';
      verifyCall.detail = `${ok} rewrite(s) accepted${rewordRejected.length ? ` · ${rewordRejected.length} rejected: ${rewordRejected.map((r) => `${r.id} ${r.reason}`).join('; ')}` : ''}`;
    }
  }
  for (const c of verified) c.ownerText = ownerLines[c.id] || c.statement;
  step('verify', { model: verifyCall?.model || brain.models?.fast || null, ms: verifyCall?.ms || 0, rewritten: Object.keys(ownerLines).length, rejected: rewordRejected, skipped: !verifyCall });
  if (verifyCall) modelEvent(verifyCall);

  // 8. Write (reasoning model): owner summary + seller pitch that cites claim ids
  const writeOut = await ask('write', { ctx, claims: verified.map((c) => ({ id: c.id, type: c.type, tone: c.tone, area: c.area, statement: c.statement })) });
  if (writeOut.error) partial.push(`Writer did not answer (${writeOut.error}); no summary or pitch was written. The verified claims above stand on their own.`);
  const w = writeOut.json || {};
  const ids = new Set(verified.map((c) => c.id));
  const findings = [];
  const uncited = [];
  for (const f of Array.isArray(w.pitch?.findings) ? w.pitch.findings : []) {
    if (!f || typeof f !== 'object') continue;
    const cites = (Array.isArray(f.cites) ? f.cites : []).filter(Boolean);
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
  const wc = writeOut.call;
  if (wc.outcome !== 'failed') {
    wc.outcome = uncited.length ? (findings.length ? 'partial' : 'rejected') : 'accepted';
    wc.detail = `${findings.length} cited finding(s) kept${uncited.length ? ` · ${uncited.length} sentence(s) removed by citation lint` : ''}`;
  }
  step('write', { model: wc.model, ms: wc.ms, kept: findings.length, removed: uncited, failed: !!writeOut.error });
  modelEvent(wc);

  const card = gradeCard(verified);
  const models = { calls, totals: modelTotals(calls) };
  const report = {
    ctx,
    card,
    summary: String(w.owner_summary || '').slice(0, 600),
    verified,
    dropped,
    rejected,
    pitch,
    pitchRemoved: uncited,
    models,
    partial,
    generatedAt: new Date(now()).toISOString(),
    stats: {
      proposed: claims.length, verified: verified.length, dropped: dropped.length,
      checksRun: observations.length + gated.reduce((n, g) => n + g.evidence.length, 0),
      notChecked: [...observations, ...gated.flatMap((g) => g.evidence)].filter((e) => e.pass === null && !e.skipped).length,
      modelCalls: models.totals.calls,
      tokens: models.totals.tokens,
      rewritesRejected: rewordRejected.length,
      ms: now() - t0,
    },
  };
  step('done', { report });
  return { report };
}
