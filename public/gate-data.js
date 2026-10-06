// Gate animation data: turns the run's real "gate" trace events into lanes for the gate visual.
// Pure functions, no DOM, so the mapping is tested against the report in Node (tests/gate-data.test.mjs).
// The visual never invents an outcome: a lane is kept or dropped exactly as the gate event says.

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
export const SHORT = {
  site_online: 'Site loads with real content',
  site_unreachable: 'Site does not load',
  domain_parked: 'Domain shows a for-sale page',
  https_healthy: 'HTTPS is healthy',
  ssl_expiring_soon: 'Certificate expires soon',
  ssl_invalid: 'Certificate is invalid',
  no_https_redirect: 'No redirect to HTTPS',
  no_contact_path: 'No way to get in touch on site',
  phone_confirmed: 'Phone is on its own site',
  phone_unconfirmed: 'Listed phone may be outdated',
  no_own_website: 'No website of its own',
  on_map: 'Listed on OpenStreetMap',
  not_on_map: 'Missing from OpenStreetMap',
  possibly_closed: 'May have closed',
  possibly_renamed: 'Site carries another name',
};

// Even shorter labels for narrow screens while a card is in flight (a card there is ~95 px of text).
// The full label returns once the card lands in its list; the full statement is always on hover.
export const MINI = {
  site_online: 'Site loads',
  site_unreachable: 'Site is down',
  domain_parked: 'Domain for sale',
  https_healthy: 'HTTPS healthy',
  ssl_expiring_soon: 'Cert expiring',
  ssl_invalid: 'Cert invalid',
  no_https_redirect: 'No HTTPS redirect',
  no_contact_path: 'No contact path',
  phone_confirmed: 'Phone on own site',
  phone_unconfirmed: 'Phone may be old',
  no_own_website: 'No own website',
  on_map: 'On the map',
  not_on_map: 'Not on the map',
  possibly_closed: 'May have closed',
  possibly_renamed: 'Name differs',
};

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
    label: SHORT[e.claimType || e.type] || e.statement,
    mini: MINI[e.claimType || e.type] || SHORT[e.claimType || e.type] || e.statement,
    statement: e.statement,
    verdict: dropped ? 'dropped' : 'verified',
    touches,
    dropAt,
    reason: dropped ? (e.dropReason || (failed ? `${failed.title}: ${failed.summary}` : 'not proven')) : null,
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
