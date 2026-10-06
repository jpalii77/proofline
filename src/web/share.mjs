// Shareable, read-only report links: /r/<id>.
//
// When a run finishes, the server stores its trace (the same events the page streamed, ending with
// the report) under an unguessable id for SHARE_DAYS days. /r/<id> opens the same page in read-only
// mode and replays it. What is stored: the query, the business's public information the agent found
// (search results, checks, proofs), the model-call records and a timestamp. Never an IP, a visitor
// hash, a key or the visitor's remaining quota.

export const SHARE_DAYS = 14;
export const SHARE_MS = SHARE_DAYS * 86400000;
export const SHARE_MAX_BYTES = 1_500_000;
export const SHARE_ID = /^[a-z0-9]{12}$/;

/** 12 lowercase base-36 characters from the platform CSPRNG (~62 bits). */
export function newShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => (b % 36).toString(36)).join('');
}

// Per-visitor or per-run details that do not belong in a shared copy.
const PRIVATE_FIELDS = { run: ['left'], cached: [] };

/** The stored record for a finished run, or null when it should not be shared (no report / too big). */
export function shareRecord({ id, query, mode, events, at = Date.now() }) {
  const done = events.find((e) => e.type === 'done');
  if (!done?.report) return null;
  const clean = events
    .filter((e) => !['share', 'error'].includes(e.type))
    .map((e) => {
      const drop = PRIVATE_FIELDS[e.type];
      if (!drop?.length) return e;
      const copy = { ...e };
      for (const k of drop) delete copy[k];
      return copy;
    });
  const record = { id, at, query: String(query || '').slice(0, 200), mode, events: clean };
  return JSON.stringify(record).length <= SHARE_MAX_BYTES ? record : null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Title and description for link previews of a shared report. */
export function shareMeta(record) {
  const report = record?.events?.find((e) => e.type === 'done')?.report;
  if (!report) return null;
  const name = report.ctx?.displayName || report.ctx?.name || report.ctx?.domain || 'a business';
  const s = report.stats || {};
  return {
    title: `${name} — Proofline report`,
    description: `Digital health ${report.card?.grade && report.card.grade !== '–' ? `grade ${report.card.grade}` : 'card'}: ${s.verified ?? 0} claim(s) verified, ${s.dropped ?? 0} dropped by the proof gate. Every claim links to its proof.`,
  };
}

/** Rewrites the static page's <title> and preview tags for a shared report. Values are escaped. */
export function injectShareMeta(html, record) {
  const meta = shareMeta(record);
  if (!meta) return html.replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex">');
  const t = esc(meta.title);
  const d = esc(meta.description);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex">');
}
