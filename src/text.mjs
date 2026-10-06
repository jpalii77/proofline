// Small, dependency-free text helpers: folding, similarity, phones, hosts.

const FOLD_MAP = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u' };

/** Lowercase, strip accents (incl. Turkish letters), collapse non-alphanumerics to single spaces. */
export function fold(s) {
  if (!s) return '';
  return String(s)
    .replace(/[ıİşŞğĞçÇöÖüÜ]/g, (c) => FOLD_MAP[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Words that say what kind of business it is, not which one. Ignored when comparing names.
const GENERIC = new Set([
  'the', 'and', 've', 'ltd', 'sti', 'as', 'llc', 'inc', 'co', 'company', 'sirketi',
  'cafe', 'kafe', 'coffee', 'kahve', 'restaurant', 'restoran', 'clinic', 'klinik', 'dental', 'dis',
  'bike', 'bisiklet', 'repair', 'tamir', 'shop', 'store', 'magaza', 'official', 'resmi', 'home', 'anasayfa', 'welcome',
]);

export function nameTokens(s) {
  return fold(s).split(' ').filter((t) => t.length > 1 && !GENERIC.has(t));
}

function trigrams(s) {
  const t = `  ${s} `;
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** 0..1 similarity of two business names (Jaccard over trigrams of distinctive tokens). */
export function nameSimilarity(a, b) {
  const ta = nameTokens(a).join(' ');
  const tb = nameTokens(b).join(' ');
  if (!ta || !tb) return 0;
  if (ta === tb) return 1;
  const A = trigrams(ta);
  const B = trigrams(tb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Digits-only phone key, comparable across formats. Keeps the last 10 digits (national number). */
export function phoneKey(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Phone-looking strings in free text. */
export function extractPhones(text) {
  if (!text) return [];
  const found = String(text).match(/(?:\+?\d[\d\s().-]{7,18}\d)/g) || [];
  const keys = new Set();
  for (const f of found) {
    const k = phoneKey(f);
    if (k && k.length >= 9) keys.add(k);
  }
  return [...keys];
}

/** "https://www.Example.com/path" -> "example.com". Returns null for junk. */
export function normalizeHost(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!/^[a-z]+:\/\//.test(s)) s = `https://${s}`;
  try {
    const h = new URL(s).hostname.replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(h)) return null;
    return h;
  } catch {
    return null;
  }
}

/** Does the string look like a domain rather than a business name? */
export function looksLikeDomain(s) {
  return /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(String(s).trim());
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

export function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = re.exec(html || '');
  return m ? decodeEntities(m[1]).trim() : '';
}

/** Text of every <h1> on the page. */
export function headings(html) {
  return [...String(html || '').matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => visibleText(m[1])).filter(Boolean);
}

/** Domain-looking strings in free text ("Website: sakalkafe.com.tr"), normalised, file names skipped. */
export function domainsIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b/gi)) {
    const d = normalizeHost(m[1]);
    if (d && !/\.(png|jpe?g|gif|webp|svg|html?|php|pdf)$/.test(d)) out.add(d);
  }
  return [...out];
}

/** fold() plus one spelling for café words, so "Sakal Café" and "sakal kafe" compare equal. */
export function canonName(s) {
  return fold(s).replace(/\b(cafe|caffe|kafe|kafesi|cafesi)\b/g, 'kafe');
}

export function visibleText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
