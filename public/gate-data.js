// Gate animation data: turns the run's real "gate" trace events into lanes for the gate visual.
// Pure functions, no DOM, so the mapping is tested against the report in Node (tests/gate-data.test.mjs).
// The visual never invents an outcome: a lane is kept or dropped exactly as the gate event says.

import { DICT, t } from './i18n.js';

// Three gate lines, in the order a claim meets them. Every check belongs to exactly one.
export const GATES = [
  { key: 'identity', label: 'Identity', short: 'Identity', checks: ['site.own_site', 'web.own_site_found', 'page.name_match'] },
  { key: 'web', label: 'Web · TLS', short: 'Web·TLS', checks: ['dns.resolves', 'http.reachable', 'http.https_redirect', 'tls.cert_valid', 'page.not_parked'] },
  { key: 'reach', label: 'Contact · Map', short: 'Contact', checks: ['page.contact_path', 'page.phone_listed', 'osm.listed', 'web.no_closure_signal'] },
];

export function gateOf(check) {
  const i = GATES.findIndex((g) => g.checks.includes(check));
  if (i >= 0) return i;
  // Unknown check family: place it by prefix, never lose it.
  const p = String(check).split('.')[0];
  return p === 'site' ? 0 : p === 'osm' || p === 'web' ? 2 : 1;
}

// Short card labels per claim type. No numbers or names: the full statement is always one hover away.
// The text lives in i18n.js ("short.<type>"); SHORT is the English table.
const table = (prefix, lang = 'en') => Object.fromEntries(Object.entries(DICT[lang]).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
export const SHORT = table('short.');

// Even shorter labels for narrow screens while a card is in flight (a card there is ~95 px of text).
// The full label returns once the card lands in its list; the full statement is always on hover.
export const MINI = table('mini.');

/** The labels of one claim type in the current interface language (null for an unknown type). */
export function shortLabel(type) { return type && SHORT[type] ? t(`short.${type}`) : null; }
export function miniLabel(type) { return type && MINI[type] ? t(`mini.${type}`) : null; }
export function labelTables(lang) { return { short: table('short.', lang), mini: table('mini.', lang) }; }

/**
 * One lane per gate event, in trace order.
 * lane = { id, type, label, statement, verdict: 'verified'|'dropped', touches: [gate idx...],
 *          dropAt: gate idx | null, reason: string|null, failed: { check, title, summary } | null }
 * A dropped claim stops at the gate holding its first check that did not match (or was skipped:
 * inconclusive is not proven). A kept claim passes all three.
 */
export function laneFromGate(e) {
  const evidence = Array.isArray(e.evidence) ? e.evidence : [];
  const touches = [...new Set(evidence.map((x) => gateOf(x.check)))].sort((a, b) => a - b);
  const dropped = e.verdict !== 'verified';
  let failed = null;
  let dropAt = null;
  if (dropped) {
    const bad = evidence.filter((x) => x.matched === false || x.skipped);
    bad.sort((a, b) => gateOf(a.check) - gateOf(b.check));
    failed = bad[0] ? { check: bad[0].check, title: bad[0].title, summary: bad[0].summary } : null;
    dropAt = failed ? gateOf(failed.check) : touches.length ? touches[touches.length - 1] : GATES.length - 1;
  }
  return {
    id: e.id,
    type: e.claimType || e.type || null,
    label: shortLabel(e.claimType || e.type) || e.statement,
    mini: miniLabel(e.claimType || e.type) || shortLabel(e.claimType || e.type) || e.statement,
    statement: e.statement,
    verdict: dropped ? 'dropped' : 'verified',
    touches,
    dropAt,
    reason: dropped ? (e.dropReason || (failed ? `${failed.title}: ${failed.summary}` : t('gate.notProven'))) : null,
    failed,
  };
}

export function lanesFromEvents(events) {
  return events.filter((e) => e && e.type === 'gate').map(laneFromGate);
}

// Same lanes from a finished report (shared links and cached runs carry the report too).
export function lanesFromReport(report) {
  const toEvent = (c) => ({ id: c.id, claimType: c.type, verdict: c.verdict, statement: c.statement, dropReason: c.dropReason, evidence: c.evidence || [] });
  return [...(report.verified || []), ...(report.dropped || [])].map((c) => laneFromGate(toEvent(c)));
}

export function gateSummary(lanes) {
  const kept = lanes.filter((l) => l.verdict === 'verified').length;
  return { proposed: lanes.length, kept, dropped: lanes.length - kept };
}
