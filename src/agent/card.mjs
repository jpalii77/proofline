// Digital health card: deterministic grades from verified claims only.

export const AREAS = {
  reach: 'Website',
  security: 'Security',
  contact: 'Contact',
  presence: 'Presence',
};

const PENALTY = {
  site_unreachable: 80, domain_parked: 80, ssl_invalid: 60,
  ssl_expiring_soon: 25, no_https_redirect: 20, no_contact_path: 40,
  phone_unconfirmed: 20, not_on_map: 35, possibly_closed: 50, possibly_renamed: 25,
};

function letter(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function gradeCard(verified) {
  const areas = {};
  for (const [key, label] of Object.entries(AREAS)) {
    const mine = verified.filter((c) => c.area === key);
    if (!mine.length) { areas[key] = { label, grade: '–', score: null, claims: [] }; continue; }
    const score = Math.max(0, 100 - mine.reduce((s, c) => s + (PENALTY[c.type] || 0), 0));
    areas[key] = { label, grade: letter(score), score, claims: mine.map((c) => c.id) };
  }
  const scored = Object.values(areas).filter((a) => a.score !== null);
  const overall = scored.length ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length) : null;
  return { overall, grade: overall === null ? '–' : letter(overall), areas };
}
