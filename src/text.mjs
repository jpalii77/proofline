// Small, dependency-free text helpers: folding, similarity, phones, hosts.

import { isValidHostname } from './hostname.mjs';

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

// Words that name a trade ("Sürücü Kursu", "Butik Otel", "Ağız ve Diş Sağlığı"). Shared trade words make two
// different businesses look alike: "A2 Sürücü Kursu" and "Aysan Sürücü Kursu" (round 3). They stay in the name
// (unlike GENERIC above), but a match must also hold on what is left once they are set aside.
const TRADE = new Set([
  'surucu', 'kursu', 'kurs', 'otel', 'hotel', 'hotels', 'butik', 'boutique', 'pansiyon', 'apart', 'motel',
  'wedding', 'dugun', 'davet', 'salonu', 'house', 'evi', 'organizasyon', 'garden', 'bahce', 'kir',
  'poliklinik', 'poliklinigi', 'agiz', 'sagligi', 'merkezi', 'hastanesi', 'veteriner', 'guzellik', 'kuafor', 'berber',
]);

function trigramSim(ta, tb) {
  if (!ta || !tb) return 0;
  if (ta === tb) return 1;
  const A = trigrams(ta);
  const B = trigrams(tb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** The distinctive words of a name without its trade words ("A2 Sürücü Kursu" -> ["a2"]); all of them if none is left. */
export function coreTokens(s) {
  const all = nameTokens(s);
  const core = all.filter((t) => !TRADE.has(t));
  return core.length ? core : all;
}

/** 0..1 similarity of two business names (Jaccard over trigrams of distinctive tokens). */
export function nameSimilarity(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const full = trigramSim(ta.join(' '), tb.join(' '));
  // When both names keep something besides trade words, that part must match too (never raises a score).
  const ca = ta.filter((t) => !TRADE.has(t));
  const cb = tb.filter((t) => !TRADE.has(t));
  if (ca.length && cb.length && ca.length < ta.length && cb.length < tb.length) {
    // one core inside the other ("A2" in "A2 Ankara") is the same business; otherwise the cores must be alike
    const inside = ca.every((t) => cb.includes(t)) || cb.every((t) => ca.includes(t));
    return inside ? full : Math.min(full, trigramSim(ca.join(' '), cb.join(' ')));
  }
  return full;
}

/** Digits-only phone key, comparable across formats. Keeps the last 10 digits (national number). */
export function phoneKey(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Phone-looking strings in free text. Two numbers written side by side ("0212 444 55 66 - 0532 765 43 21")
 * or a number followed by a year ("… 45 67 2024") are one run of digits to the pattern: the run is cut
 * into numbers by the longest a number can be, judged by how it starts (audit 15 Oct: they were read as
 * one bogus number, and the real one was then "not on the site").
 */
export function extractPhones(text) {
  if (!text) return [];
  const runs = String(text).match(/(?:\+?\d[\d\s().-]{7,40}\d)/g) || [];
  const keys = new Set();
  for (const run of runs) {
    for (const piece of run.split(/\s[-–]\s|[/,;|]/)) {
      for (const number of splitDigitGroups(piece)) {
        const k = phoneKey(number);
        if (k && k.length >= 9) keys.add(k);
      }
    }
  }
  return [...keys];
}

// The most digits one number can have: "00…" international 15, "+…" 13, "90…" 12, "0…" 11, else 10.
function maxDigits(digits, plus) {
  if (digits.startsWith('00')) return 15;
  if (plus) return 13;
  if (digits.startsWith('90')) return 12;
  if (digits.startsWith('0')) return 11;
  return 10;
}

/** "0212 444 55 66 0532 765 43 21" -> ["0212 444 55 66", "0532 765 43 21"]: groups are kept whole. */
function splitDigitGroups(piece) {
  const groups = piece.match(/\d+/g) || [];
  const out = [];
  let cur = '';
  let plus = /^\s*\+/.test(piece);
  for (const g of groups) {
    if (cur && (cur + g).length > maxDigits(cur, plus)) {
      out.push(cur);
      cur = '';
      plus = false;
    }
    cur += g;
  }
  if (cur) out.push(cur);
  return out;
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

// Pages come from anyone. Tags are found with plain index scans, not with lazy regexes: a page full of
// unclosed "<title" or "<script" made those regexes take seconds per 100 KB and minutes per 2 MB (audit 15 Oct).
const asciiLower = (s) => s.replace(/[A-Z]+/g, (c) => c.toLowerCase()); // same length, so indexes line up
const TAG_MAX = 8192; // longer "tags" are not real meta/html tags; regexes only ever see this much

/** Each opening tag `<name …>` as written, in order. */
export function openTags(html, name) {
  const s = String(html || '');
  const low = asciiLower(s);
  const open = `<${name}`;
  const out = [];
  for (let i = low.indexOf(open); i !== -1; i = low.indexOf(open, i + open.length)) {
    const next = low[i + open.length];
    if (next !== undefined && !/[\s/>]/.test(next)) continue;
    const end = low.indexOf('>', i);
    if (end === -1) break;
    out.push(s.slice(i, Math.min(end + 1, i + TAG_MAX)));
  }
  return out;
}

/** Inner HTML of each `<name …>…</name>` element, in order (no nesting). */
export function elements(html, name, limit = Infinity) {
  const s = String(html || '');
  const low = asciiLower(s);
  const open = `<${name}`;
  const close = `</${name}`;
  const out = [];
  let i = low.indexOf(open);
  while (i !== -1 && out.length < limit) {
    const next = low[i + open.length];
    if (next !== undefined && !/[\s/>]/.test(next)) { i = low.indexOf(open, i + open.length); continue; }
    const start = low.indexOf('>', i);
    if (start === -1) break;
    const end = low.indexOf(close, start);
    if (end === -1) break;
    out.push(s.slice(start + 1, end));
    i = low.indexOf(open, end);
  }
  return out;
}

export function pageTitle(html) {
  const [t] = elements(html, 'title', 1);
  return t !== undefined ? decodeEntities(t).replace(/\s+/g, ' ').trim() : '';
}

export function metaContent(html, prop) {
  const re = new RegExp(`^<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  for (const tag of openTags(html, 'meta')) {
    const m = re.exec(tag);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

/**
 * Names the page gives itself in schema.org data ("name", "legalName", "alternateName" of an Organization,
 * store or business). Round 18: teknofish.com's title is a slogan; only its structured data says
 * "Teknofish Elektronik". Unreadable or oversized blocks are skipped.
 */
export function orgNames(html) {
  const out = [];
  for (const block of elements(html, 'script', 200)) {
    if (block.length > 200_000 || !block.includes('@context')) continue;
    let data;
    try { data = JSON.parse(block.trim()); } catch { continue; }
    const stack = [data];
    for (let n = 0; stack.length && n < 2000; n++) {
      const x = stack.pop();
      if (Array.isArray(x)) { stack.push(...x); continue; }
      if (!x || typeof x !== 'object') continue;
      const types = [].concat(x['@type'] || []).map(String);
      if (types.some((t) => /organization|business|store|corporation/i.test(t))) {
        for (const k of ['name', 'legalName', 'alternateName']) {
          for (const v of [].concat(x[k] || [])) if (typeof v === 'string' && v.trim() && v.length < 200) out.push(decodeEntities(v).trim());
        }
      }
      if (x['@graph']) stack.push(x['@graph']);
    }
  }
  return [...new Set(out)];
}

/** Text of every <h1> on the page. */
export function headings(html) {
  return elements(html, 'h1').map((x) => visibleText(x)).filter(Boolean);
}

/**
 * Web addresses written in free text ("Website: sakalkafe.com.tr", "https://x.com/menu"), normalised.
 * Only whole tokens count: a match glued to letters ("A.Ayrancı" -> "a.ayranc"), an email
 * ("info@x.com"), an @handle ("@sakal.kafe") or a path segment ("instagram.com/kafe.tr") is not a
 * web address. The ending must be a real
 * public suffix (see hostname.mjs), which also rules out file names ("menu.pdf").
 */
export function domainsIn(text) {
  const out = new Set();
  const re = /(?<![\p{L}\p{N}@._%+-])(?<![^/]\/)((?:[a-z0-9-]+\.)+[a-z0-9-]{2,})(?![\p{L}\p{N}_@-]|\.[\p{L}\p{N}])/giu;
  for (const m of String(text || '').matchAll(re)) {
    const d = normalizeHost(m[1]);
    if (d && isValidHostname(d)) out.add(d);
  }
  return [...out];
}

/** fold() plus one spelling for café words, so "Sakal Café" and "sakal kafe" compare equal. */
export function canonName(s) {
  return fold(s).replace(/\b(cafe|caffe|kafe|kafesi|cafesi)\b/g, 'kafe');
}

export function visibleText(html) {
  return decodeEntities(stripTags(dropBlocks(dropBlocks(String(html || ''), 'script'), 'style'))).replace(/\s+/g, ' ').trim();
}

/** Removes every `<name…>…</name>` block; an unclosed one is left in place, as the old regex did. */
function dropBlocks(s, name) {
  const low = asciiLower(s);
  const close = `</${name}>`;
  let out = '';
  let from = 0;
  for (let i = low.indexOf(`<${name}`); i !== -1; i = low.indexOf(`<${name}`, from)) {
    const end = low.indexOf(close, i);
    if (end === -1) break;
    out += `${s.slice(from, i)} `;
    from = end + close.length;
  }
  return out + s.slice(from);
}

/** Every `<…>` tag becomes a space; a "<" with no ">" after it stays as text. */
function stripTags(s) {
  let out = '';
  let from = 0;
  for (let i = s.indexOf('<'); i !== -1; i = s.indexOf('<', from)) {
    const end = s.indexOf('>', i + 1);
    if (end === -1) break;
    if (end === i + 1) { out += s.slice(from, end + 1); from = end + 1; continue; } // "<>" is not a tag
    out += `${s.slice(from, i)} `;
    from = end + 1;
  }
  return out + s.slice(from);
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
