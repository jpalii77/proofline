// Evidence checks. Each check is a small, re-runnable probe of the outside world.
//
//   run(io, params) -> { pass: true | false | null, summary, observed }
//
// pass === null means "inconclusive" (timeout, missing data). A claim never rests on an
// inconclusive check: the gate treats null as "not proven".
// Checks only read public business information. They never store personal data.

import { invalidHostSentence, isValidHostname } from './hostname.mjs';
import { isHostLimit } from './limits.mjs';
import { classifyHost } from './platforms.mjs';
import {
  canonName, coreTokens, domainsIn, elements, extractPhones, fold, headings, looksLikeDomain, metaContent, nameSimilarity, nameTokens, normalizeHost,
  listedWebsites, openTags, orgNames, pageTitle, phoneKey, visibleText,
} from './text.mjs';

/**
 * The discovery search. The pipeline and the own-site checks use the same query.
 * The plain name (and city) finds the business's own site far more often than "… official website phone":
 * 8 of 9 known own sites vs 5 of 9 on the same 12 businesses (12 Oct 2026, scripts/search-variants.mjs),
 * with 10 results instead of 5 (DISCOVERY_RESULTS; still 1 Tavily credit per search).
 */
export const DISCOVERY_RESULTS = 10;
export function discoveryQuery({ name, city, domain } = {}) {
  if (!name && domain) return `${domain} business contact`;
  return `${name || ''} ${city || ''}`.replace(/\s+/g, ' ').trim();
}

// \b only knows ASCII letters, so "\bçok" and "kapandı\b" never matched (audit 15 Oct). Turkish
// phrases use letter-aware edges instead.
const trWord = (src) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`, 'iu');

// Parking, for-sale, suspended and placeholder pages. Matched on the title and the visible text.
const PARKED = [
  /\b(this )?domain (name )?(is|may be) for sale\b/i,
  /\bbuy this domain\b/i,
  /\bmake an offer\b.*\bdomain\b/i,
  /\bhugedomains\b|\bsedo(parking)?\b|\bafternic\b|\bparkingcrew\b|\bbodis\b|\bdan\.com\b/i,
  /\baccount (has been )?suspended\b/i,
  /\bdefault web page\b|\bwelcome to nginx\b|^it works!?$/i,
  /\bindex of \//i,
  trWord('alan ad[ıi] sat[ıi]l[ıi]kt[ıi]r|sat[ıi]l[ıi]k alan ad[ıi]'),
  /\bcoming soon\b/i,
  trWord('[çc]ok yak[ıi]nda'),
  // "osepet.com for sale | Spaceship.com", "Domain for sale" (round 4)
  /\bdomain for sale\b|\b[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2})? (is )?for sale\b/i,
  // "Yakında Başlatılacak" (round 6: osepet.net, a website-builder placeholder), "launching soon"
  trWord('yak[ıi]nda (ba[şs]lat[ıi]lacak|a[çc][ıi]lacak|hizmetinizde|sizlerle)|yap[ıi]m a[şs]amas[ıi]nda'),
  /\blaunching soon\b|\bunder construction\b/i,
];

/**
 * A phone number made of a counting run or one repeated digit ("0212 123 45 67", "555 555 55 55") is a
 * template's placeholder, not evidence (round 6: a template-looking shop page listed 212 123 45 67).
 */
export function placeholderPhone(raw) {
  const key = phoneKey(raw);
  if (!key) return false;
  const local = key.slice(-7);
  return /^(\d)\1{6}$/.test(local) || '0123456789'.includes(local) || '9876543210'.includes(local);
}

/** A parked, for-sale or placeholder page (the same markers as page.not_parked). */
function isParked(p) {
  if (emptyPage(p)) return true;
  const hay = `${p.title || ''}\n${(p.text || '').slice(0, 4000)}`;
  return PARKED.some((re) => re.test(hay));
}

/**
 * No title, no site name and almost no text: an empty answer (bebetto.com.tr, 0 bytes) or a script that jumps
 * to a parking page (stylemeshop.com, round 12). Not real content, whatever the status code says.
 */
function emptyPage(p) {
  return !(p.title || '').trim() && !metaContent(p.html || '', 'og:site_name') && (p.text || '').trim().length < 40;
}

// Words shop names share across many businesses: alone (with initials or short words) they name nobody.
const COMMON_NAME_WORDS = new Set([
  'collection', 'koleksiyon', 'style', 'stil', 'fashion', 'moda', 'home', 'store', 'shop', 'magaza', 'market',
  'design', 'tasarim', 'concept', 'life', 'world', 'dunya', 'line', 'studio', 'group', 'grup', 'center',
  'merkez', 'plus', 'gold', 'altin', 'luxury', 'lux', 'premium', 'outlet', 'trend', 'butik', 'boutique', 'giyim',
]);

/**
 * A name with at least one word of 4+ letters that is not a common shop word: "Lahza Butik", "D&P Perfumum",
 * "Ebru Elbise". "MK Collection" or "Style Me Shop" are initials and common words only (round 13).
 */
export function distinctiveName(name) {
  return coreTokens(name).some((t) => t.length >= 4 && !COMMON_NAME_WORDS.has(t));
}

/**
 * The page links to one of the business's own listings that search turned up (its Instagram account or
 * Shopier store), so the site and the listing belong together.
 */
function linksToListing(p, results, name) {
  const html = String(p?.html || '').toLowerCase();
  if (!html) return false;
  for (const r of results || []) {
    if (!namesBusiness(`${r.title || ''} ${r.content || ''}`, name)) continue;
    let u;
    try { u = new URL(r.url); } catch { continue; }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (!/^(instagram\.com|shopier\.com|facebook\.com|tiktok\.com)$/.test(host)) continue;
    const handle = u.pathname.split('/').filter(Boolean)[0];
    if (!handle || ['p', 'reel', 'reels', 'explore', 'popular', 'stories'].includes(handle.toLowerCase())) continue;
    if (html.includes(`${host}/${handle.toLowerCase()}`)) return true;
  }
  return false;
}

/**
 * Something on the page or the address ties it to Turkey, where Proofline's businesses are: a .tr address,
 * lang="tr", Turkish-only letters, a lira price or a +90 number. With a bare name, a site that spells the name
 * but shows none of this may belong to a namesake abroad (round 12: mkcollection.com, a US fabrics company).
 */
export function turkeyTie(p, host) {
  if (/\.tr$/i.test(String(host || ''))) return true;
  const html = p?.html || '';
  if (/\blang=["']?tr/i.test(openTags(html, 'html')[0] || '')) return true;
  const hay = `${p?.title || ''} ${metaContent(html, 'og:site_name') || ''} ${(p?.text || '').slice(0, 20000)}`;
  return /[ğışĞİŞ]/.test(hay) || /₺|\bTL\b|\+90[\s(]?\d/.test(hay);
}

const CLOSURE = [
  /\bpermanently closed\b/i,
  /\bclosed (its doors|for good|down)\b/i,
  trWord('kal[ıi]c[ıi] olarak kapan\\p{L}*'),
  trWord('kapand[ıi]'),
  /\bout of business\b/i,
];

function okStatus(s) { return typeof s === 'number' && s >= 200 && s < 400; }

// Answers that mean "not for you, not now", not "this site is down".
const REFUSED_STATUS = new Set([401, 403, 407, 429, 503]);
// Resolver trouble on our side (temporary failure, DoH service error), unlike ENOTFOUND which is an answer.
const DNS_SERVICE_ERROR = /EAI_AGAIN|ESERVFAIL|DoH HTTP|DNS status/i;

// Pages get a second attempt too: one timeout must not decide anything.
async function page(io, url) {
  let r = await io.fetchPage(url);
  if (!okStatus(r.status)) r = await io.fetchPage(url, { attempt: 1 });
  const html = r.body || '';
  return { ...r, html, title: pageTitle(html), text: visibleText(html) };
}

// Social links whose first path part is not an account name.
const NOT_HANDLE = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'sharer', 'sharer.php', 'share', 'pages', 'profile.php', 'watch', 'groups', 'tr', 'intent', 'hashtag', 'tag']);

/**
 * Other names the business's own site goes by: og:site_name, its structured data and the accounts it links
 * (instagram.com/tereci_izmir → "tereci"). Only the words the typed name and city do not already hold, 4+ letters.
 */
export function ownSiteAliases(p, name, { place = null, max = 2 } = {}) {
  const html = String(p?.html || '');
  // (the city in a handle, "tereci_izmir", is not part of the name)
  const given = new Set([...nameTokens(name), ...nameTokens(place || '')]);
  const raw = [metaContent(html, 'og:site_name'), ...orgNames(html).slice(0, 5)];
  for (const m of html.matchAll(/(?:instagram|facebook|tiktok)\.com\/@?([A-Za-z0-9._-]{3,40})/gi)) {
    if (NOT_HANDLE.has(m[1].toLowerCase())) continue;
    raw.push(m[1].replace(/[._-]+/g, ' ').replace(/\d+/g, ' '));
  }
  const out = [];
  for (const r of raw) {
    if (!r) continue;
    const left = nameTokens(r).filter((t) => t.length >= 4 && !given.has(t));
    const alias = left.join(' ');
    // (a handle that runs the name together, "yoreselbakkal", is the name itself)
    if (!alias || nameSimilarity(alias, name) >= 0.5 || fold(name).replace(/ /g, '').includes(alias.replace(/ /g, ''))) continue;
    if (!out.includes(alias)) out.push(alias);
    if (out.length >= max) break;
  }
  return out;
}

/** A map place in the typed city under one of the own site's other names, or null. */
async function mapUnderAlias(io, { name, domain, place }) {
  const own = await page(io, `https://${domain}/`);
  if (!okStatus(own.status) || isParked(own)) return null;
  for (const alias of ownSiteAliases(own, name, { place })) {
    const r = await io.nominatim(`${alias}, ${place}`);
    if (r.error) continue;
    for (const x of r.results || []) {
      const mapName = x.name || String(x.display_name || '').split(',')[0];
      if (nameSimilarity(alias, mapName) < 0.5) continue;
      if (!/T[üu]rkiye|Turkey/i.test(String(x.display_name || ''))) continue;
      if (!` ${fold(x.display_name)} `.includes(` ${fold(place)} `)) continue;
      return { alias, hit: x };
    }
  }
  return null;
}

// A page longer than the read limit is cut off (src/io/real.mjs). What we found on it is proof;
// what we did not find may sit further down, so absence on a cut-off page is "not checked".
function notWholePage(observed) {
  return { pass: null, summary: 'Not checked: the homepage is longer than the part we read, so “not found” would be a guess', observed: { ...observed, truncated: true } };
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_LABEL = /(?:^|[^a-z])(?:tel|telefon|phone|gsm|cep|mobile|call|ara|iletisim|whatsapp)\s*[:.]?\s*$/i; // matched on fold()ed text

/** Phone numbers in visible text that sit right after a label like "Tel:" — not prices or order codes. */
function labelledPhones(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/\+?\d[\d\s().-]{7,18}\d/g)) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (PHONE_LABEL.test(fold(before)) && extractPhones(m[0]).length) out.push(m[0]);
  }
  return out;
}

// ---- Own-site eligibility -------------------------------------------------------------------
// A domain is treated as the business's own website only if
//   1. it is a valid web address with a real ending (hostname.mjs), not text that looks like one;
//   2. it is not a listing platform;
//   3. the evidence ties it to the business: its homepage loads and names the business, or a search
//      result that names the business shows it as a web address (result URL or an address in the text).
// A site that does not load is someone's website only through 3's search-result tie: a name that never
// appeared as a web address for this business is "no own website found", never "the site is down".
// Everything site-dependent rests on this.

const NAME_MIN = 0.45;

function namesBusiness(text, name) {
  return nameSimilarity(name, text) >= NAME_MIN || (canonName(name).length > 2 && ` ${canonName(text)} `.includes(` ${canonName(name)} `));
}

/** Search results that show `host` as a web address at all (result URL or an address in the text). */
function urlMentions(results, host) {
  return (results || []).filter((r) => normalizeHost(r.url) === host || domainsIn(`${r.title || ''} ${r.content || ''}`).includes(host)).map((r) => r.url);
}

/** Search results that tie `host` to the business (not counting path-based listing pages). */
function searchTies(results, host, name) {
  const ties = [];
  for (const r of results || []) {
    const rHost = normalizeHost(r.url);
    const hay = `${r.title || ''} ${r.content || ''}`;
    if (!namesBusiness(r.title || '', name) && !namesBusiness(hay, name)) continue;
    let path = '/';
    try { path = new URL(r.url).pathname; } catch { /* keep "/" */ }
    if (rHost === host && /^\/?(index\.\w+)?$/.test(path)) ties.push({ url: r.url, how: 'its homepage is a search result that names the business' });
    else if (rHost !== host && domainsIn(hay).includes(host)) ties.push({ url: r.url, how: 'a search result about the business names this domain' });
  }
  return ties;
}

function tokensContained(name, text) {
  const want = nameTokens(name);
  const have = new Set(nameTokens(text));
  return want.length > 0 && want.every((t) => have.has(t));
}

/** A name written as one word: "Eren Hobi" -> "erenhobi" (and without generic words: "Kamp ve Ötesi" -> "kampotesi"). */
function compactNames(name) {
  return [...new Set([fold(name).replace(/ /g, ''), nameTokens(name).join('')])].filter(Boolean);
}

/** "erenhobi.com" as a page title is the address itself: compare its first label, else the text, written as one word. */
function compactSame(value, name) {
  const v = looksLikeDomain(String(value).trim()) ? String(value).trim().split('.')[0] : value;
  const c = fold(v).replace(/ /g, '');
  return !!c && compactNames(name).includes(c);
}

/**
 * The address is the whole name written as one word (hilalavmarket.com for "Hilal AV Market"). Only for names
 * of 7+ letters: a short one ("shout", "loky") is too likely to belong to someone else.
 */
export function labelIsName(host, name) {
  const label = fold(registrable(normalizeHost(host) || host).split('.')[0]).replace(/ /g, '');
  if (label.length < 7) return false;
  // (one letter written twice also counts: lahzaabutik.com for "Lahza Butik", round 8)
  const doubledOnce = (c) => label.length === c.length + 1
    && [...label].some((ch, i) => i > 0 && ch === label[i - 1] && label.slice(0, i) + label.slice(i + 1) === c);
  return compactNames(name).some((c) => c === label || doubledOnce(c));
}

/** The parts of a title: "Loky AI - The Unified …" -> ["Loky AI - The Unified …", "Loky AI", "The Unified …"]. */
function titleParts(value) {
  const parts = String(value).split(/\s+[|\-–—:·•]\s+|\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
  return [value, ...(parts.length > 1 ? parts : [])];
}

/**
 * With nothing but a bare name to go on, a field must name exactly the business: "SHOUT – Oversize Giyim" has
 * a part that is "Shout"; "Shout! TV" and "Loky AI" only contain the name, so they may be namesakes (round 4).
 */
function identityFields(p) {
  return [['og:site_name', metaContent(p.html, 'og:site_name')], ['title', p.title], ...headings(p.html).slice(0, 3).map((x) => ['h1', x]),
    ...orgNames(p.html).slice(0, 5).map((x) => ['structured data', x])];
}

function exactIdentity(p, name) {
  const want = nameTokens(name).join(' ');
  const fields = identityFields(p);
  for (const [field, value] of fields) {
    if (!value) continue;
    for (const part of titleParts(value)) {
      // A title that is only an address ("osepet.net", a site builder's default) counts like the address
      // itself: only for names of 7+ letters (round 7: osepet.net, an unclaimed "launching soon" page).
      if (looksLikeDomain(part.trim())) { if (labelIsName(part.trim(), name)) return { field, value }; continue; }
      if ((want && nameTokens(part).join(' ') === want) || compactSame(part, name)) return { field, value };
    }
  }
  return null;
}

/** Does the homepage itself say whose site this is? Title, og:site_name, <h1>, then body text. */
function pageIdentity(p, name, min = NAME_MIN) {
  const fields = identityFields(p).filter(([, v]) => v);
  let best = { field: null, value: '', score: 0 };
  for (const [field, value] of fields) {
    // A long title ("Sakal Café — Kahve & Kahvaltı, Ankara") still names the business when it
    // contains every distinctive word of the name; a title that is the name written as one word
    // or the address itself ("erenhobi.com" for "Eren Hobi", round 4) names it too.
    const score = tokensContained(name, value) || titleParts(value).some((x) => compactSame(x, name)) ? 1 : nameSimilarity(name, value);
    if (score > best.score) best = { field, value, score };
  }
  if (best.score >= min) return { identified: true, ...best };
  if (canonName(name).length > 2 && ` ${canonName(p.text.slice(0, 20000))} `.includes(` ${canonName(name)} `)) {
    return { identified: true, field: 'body', value: name, score: best.score };
  }
  return { identified: false, ...best };
}

// How far a cut-off homepage is read again when the typed city is not in the first part (src/io/real.mjs caps it).
const DEEP_READ = 2_000_000;

/** The first link on the page to its own contact or about page ("/pages/iletisim"), as a full URL; else null. */
function contactLink(p, host) {
  // the address is captured first, then tested: one pattern doing both took seconds on a hostile page (audit 15 Oct)
  const CONTACT = /iletisim|iletişim|contact|bize-ulasin|hakkimizda|hakkımızda|about/i;
  for (const m of String(p?.html || '').matchAll(/href=["']([^"'#?]{1,2048})["']/gi)) {
    if (!CONTACT.test(m[1])) continue;
    let u;
    try { u = new URL(m[1], `https://${host}/`); } catch { continue; }
    if (registrable(normalizeHost(u.href)) !== registrable(host)) continue;
    return u.href;
  }
  return null;
}

/** Does the place ("Kadıköy, Istanbul": either part) appear on the page, or in a search result that shows this host? */
function placeTie(p, results, host, city) {
  const wants = String(city).split(',').map((x) => fold(x).trim()).filter((x) => x.length >= 3);
  if (!wants.length) return 'no usable city given';
  const names = (hay) => { const h = ` ${fold(hay)} `; return wants.find((w) => h.includes(` ${w} `)); };
  const onPage = names(p?.html || '');
  if (onPage) return `the homepage names ${onPage}`;
  for (const r of results || []) {
    const hay = `${r.title || ''} ${r.content || ''}`;
    if (normalizeHost(r.url) !== host && !domainsIn(hay).includes(host)) continue;
    const hit = names(hay);
    if (hit) return `a search result for this site names ${hit} (${r.url})`;
  }
  return null;
}

function hostLabelNames(sub, name) {
  const label = fold(sub).replace(/ /g, '');
  const tokens = nameTokens(name).filter((t) => t.length >= 3);
  // the trade words alone are not the name: "aysansurucukursu" holds "surucu kursu" but not "A2" (round 3)
  const core = coreTokens(name).filter((t) => t.length >= 2);
  return tokens.length > 0 && tokens.every((t) => label.includes(t)) && core.every((t) => label.includes(t));
}

/**
 * Verdict for one candidate host. `results` are discovery search results (already fetched).
 * needSearchTie: the page alone is not enough, a search result must tie the domain to the business.
 */
async function ownSiteVerdict(io, { host, name, city = null, results, searchError, userGiven = false, needSearchTie = false }) {
  const invalid = invalidHostSentence(host);
  if (invalid) return { pass: false, summary: `${invalid} — no own website found`, observed: { host, invalidHost: true } };
  const cls = classifyHost(host);
  if (cls.kind === 'platform') {
    return { pass: false, summary: `${host} is a listing platform (${cls.label}), not the business's own website`, observed: { host, platform: cls.label } };
  }
  if (cls.kind === 'builder' && !(cls.sub && name && hostLabelNames(cls.sub, name))) {
    return { pass: false, summary: `${host} is a site-builder address that does not name the business, so it is not treated as its own website`, observed: { host, builder: cls.matched } };
  }
  if (userGiven) return { pass: true, summary: `${host} was given by the user as the business's website`, observed: { host, userGiven: true } };
  if (!name) return { pass: null, summary: 'No business name to check the site against', observed: { host } };
  // A bare name has no place to tie a site to, and a whole-name address under another country's ending is
  // often a namesake there (round 9: dpperfumum.com.eg, an Egyptian shop, for the Istanbul D&P Perfumum).
  if ((!city || looksLikeDomain(city)) && foreignCountryEnding(host) && !turkeyTie(await page(io, `https://${host}/`), host)) {
    // (a Turkish page under another ending is fine: morfose.eu/tr, round 14)
    return { pass: null, summary: `${host} ends in another country's code (.${host.split('.').pop()}); with no city or website given, it may be a namesake there`, observed: { host, foreignEnding: true, placeUnproven: true } };
  }
  // (a site builder's subdomain that names the business was already let through above)
  const parent = cls.kind === 'builder' ? null : foreignParent(host, name);
  if (parent) {
    return { pass: false, summary: `${host} is a page on ${parent}, a site that does not carry the business's name, so it is not its own website`, observed: { host, parent } };
  }

  const ties = searchTies(results, host, name);
  if (needSearchTie) {
    return ties.length
      ? { pass: true, summary: `${host} is tied to “${name}”: ${ties[0].how} (${ties[0].url})`, observed: { host, ties } }
      : { pass: searchError ? null : false, summary: searchError ? `Search failed: ${searchError}` : `No search result ties ${host} to “${name}”; a different name on an unverified site is not evidence of a rename`, observed: { host, ties } };
  }

  let p = await page(io, `https://${host}/`);
  // Some small sites answer on plain http only (round 3: sunsetboutiquehotel.com, a broken https setup).
  // That is still their site; whether https works is a separate check (http.reachable, tls.cert_valid).
  if (!okStatus(p.status) && !isHostLimit(p.error)) {
    const plain = await page(io, `http://${host}/`);
    if (okStatus(plain.status)) p = { ...plain, plainHttp: true };
  }
  const loaded = okStatus(p.status);
  let id = loaded ? pageIdentity(p, name) : { identified: false };
  const labelNames = hostLabelNames(host.split('.')[0], name);
  // A mention in the body text is not ownership: an agency's homepage lists its clients (round 2: perfist.com
  // names "Tarım Garaj"). Body text counts only when the address itself or a homepage search result agrees.
  if (id.identified && id.field === 'body' && !labelNames && !ties.some((t) => /homepage/.test(t.how))) {
    id = { ...id, identified: false, bodyOnly: true };
  }
  // A very large homepage may name the business only far down (round 2: petpal.com.tr, 6 MB). Then the address
  // naming it counts, but only with a city, so the place rule below still has to tie it to that city.
  if (loaded && !id.identified && labelNames && city && !looksLikeDomain(city)) {
    id = { identified: true, field: 'address', value: host, score: id.score };
  }
  // A bare name (no city, no address typed) is the riskiest input: "Shout" also names a US TV service and
  // "Loky" an AI company (round 4). Then the page must name exactly the business, or the address must be the
  // whole name written as one word (hilalavmarket.com); a looser match is a possible namesake, never "theirs".
  const bare = !city || looksLikeDomain(city);
  // (a for-sale page at that address is not the business's site: vatkalimon.com once was one)
  const labelOk = loaded && labelIsName(host, name) && !isParked(p);
  if (bare && labelOk && !id.identified) id = { identified: true, field: 'address', value: host, score: id.score };
  if (bare && (id.identified || ties.length)) {
    const exact = labelOk ? { field: 'address', value: host } : loaded ? exactIdentity(p, name) : null;
    if (!exact) {
      const loose = id.identified ? `${id.field}: “${id.value}”` : ties[0].how;
      return { pass: null, summary: `${host} only loosely matches “${name}” (${loose}); with no city or website given, it may be a namesake`, observed: { host, identity: id, ties, placeUnproven: true } };
    }
    // (round 13: a common name such as "MK Collection" finds whoever owns the address, in Turkey too)
    if (!ties.length && !distinctiveName(name) && !linksToListing(loaded ? p : null, results, name)) {
      return { pass: null, summary: `${host} spells “${name}”, a name made of common words, but no search result ties it to the business and it does not link to the business's own listing; it may be a namesake`, observed: { host, identity: id, ties, placeUnproven: true, commonName: true } };
    }
    if (!ties.length && !turkeyTie(loaded ? p : null, host)) {
      return { pass: null, summary: `${host} spells “${name}”, but no search result ties it to the business and nothing on it ties it to Turkey; with no city or website given, it may be a namesake abroad`, observed: { host, identity: id, ties, placeUnproven: true, noTurkeyTie: true } };
    }
    id = { ...id, identified: true, ...exact, score: 1 };
  }
  if (id.identified || ties.length) {
    // A name alone can belong to a namesake elsewhere (petpal.com is a US network, not the Bursa shop):
    // with a city given, the page or a search result showing this site must name that city too.
    let place = city && !looksLikeDomain(city) ? placeTie(loaded ? p : null, results, host, city) : 'no city given';
    // A long homepage may name the city only past the part we read (round 14: thesezar.com, 5 MB, İzmir at
    // 569 KB). The contact or about page it links to usually names it early.
    if (!place && loaded) {
      const link = contactLink(p, host);
      if (link) {
        const c = await page(io, link);
        const hit = okStatus(c.status) && placeTie(c, [], host, city);
        if (hit) place = `its contact page (${link}) names ${city}`;
      }
    }
    // Some name it on neither (round 16: patiburda.com, 1.4 MB, Ankara once at 1.2 MB; its contact page is
    // silent): read the cut-off homepage once more, further down, for the city alone.
    if (!place && loaded && p.truncated) {
      const deep = await io.fetchPage(p.finalUrl || `https://${host}/`, { maxBytes: DEEP_READ });
      const same = okStatus(deep.status) && registrable(normalizeHost(deep.finalUrl || '')) === registrable(host);
      const hit = same && placeTie({ html: deep.body || '' }, [], host, city);
      if (hit) place = `${hit}, far down the page (read again past the first part)`;
    }
    if (!place) {
      return { pass: null, summary: `${host} uses the name “${name}” but nothing on it or in search ties it to ${city}; it may be a namesake`, observed: { host, identity: id, ties, placeUnproven: true } };
    }
    const why = id.identified ? `names the business (${id.field}: “${id.value}”)` : `is tied to “${name}”: ${ties[0].how} (${ties[0].url})`;
    // An address that forwards to another site is not the site (round 10: dpperfumum.com forwards to
    // dpperfumum.com.tr over http and refuses https): the caller checks the target instead.
    const to = loaded ? normalizeHost(p.finalUrl || '') : null;
    const movedTo = to && registrable(to) !== registrable(host) && classifyHost(to).kind !== 'platform' ? to : null;
    return { pass: true, summary: `${host} ${why}${/contact page|far down/.test(place || '') ? `; ${place}` : ''}`, observed: { host, identity: id, ties, ...(city ? { place } : {}), ...(movedTo ? { movedTo } : {}) } };
  }
  if (!loaded && isHostLimit(p.error)) {
    // Our host ran out of requests or time: that says nothing about the business's site.
    return { pass: null, summary: `${host} not checked: ${p.error}`, observed: { host, ties, notChecked: true } };
  }
  if (!loaded) {
    // Never shown to exist: an unreachable name is not "their site is down", it is no site at all.
    if (!searchError && !urlMentions(results, host).length) {
      return { pass: false, summary: `${host} does not load and never appeared as a web address in the search results — no own website found`, observed: { host, ties, unproven: true } };
    }
    return { pass: null, summary: `${host} did not load and no search result ties it to “${name}”`, observed: { host, ties } };
  }
  return {
    pass: false,
    summary: `${host} does not identify “${name}” (page says “${id.value || p.title || 'untitled'}”) and no search result ties it to the business`,
    observed: { host, identity: id, ties },
  };
}

// Second-level suffixes, so "lumen.com.tr" is a registrable domain and not a subdomain of "com.tr".
const SECOND_LEVEL = new Set(['com', 'net', 'org', 'gen', 'web', 'biz', 'info', 'av', 'bel', 'pol', 'k12', 'edu', 'gov', 'co', 'ac', 'tv']);

/** The registrable domain a host belongs to: "a.b.example.com.tr" -> "example.com.tr". */
// Two-letter endings used worldwide as generic ones, not as a country's.
const GENERIC_CC = new Set(['io', 'co', 'ai', 'me', 'tv', 'cc', 'ly', 'to', 'gg', 'fm', 'so', 'sh', 'app']);

/** "dpperfumum.com.eg" -> true; ".com", ".com.tr", ".io" -> false. Proofline checks Turkish businesses. */
export function foreignCountryEnding(host) {
  const last = String(host || '').toLowerCase().split('.').filter(Boolean).pop() || '';
  return last.length === 2 && last !== 'tr' && !GENERIC_CC.has(last);
}

export function registrable(host) {
  const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const n = parts.length >= 3 && SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

/**
 * A subdomain of a site that does not carry the business's name is a page on someone else's site
 * (round 3: golden-boutique.ankarahotels.org is a hotel directory). Returns that site, or null.
 * "www." and the business's own subdomains (shop.lumencoffee.com) are not affected.
 */
export function foreignParent(host, name) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const base = registrable(h);
  if (!base || base === h || !name) return null;
  const label = fold(base.split('.')[0]).replace(/ /g, '');
  // trade words do not count: "ankarahotels" holds "hotel", not "Golden"
  const tokens = coreTokens(name).filter((t) => t.length >= 3);
  if (!tokens.length || tokens.some((t) => label.includes(t))) return null;
  return base;
}

/** "Naramica" -> naramica.com, naramica.com.tr. Short or generic names are not guessed (elle.com is a magazine). */
export function obviousDomains(name) {
  const slug = fold(name).replace(/[^a-z0-9]/g, '');
  if (slug.length < 7 || !nameTokens(name).length) return [];
  // Shops often write a word's last letter twice (lahzaabutik.com for "Lahza Butik", round 8 and 11):
  // one such spelling per word boundary, .com only. labelIsName accepts exactly this one doubling.
  const words = fold(name).split(' ').map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  // (two-word names only: "Kamp ve Ötesi" would only add noise)
  const doubled = words.length !== 2 ? [] : words.slice(0, -1).map((w, i) => [...words.slice(0, i), w + w.slice(-1), ...words.slice(i + 1)].join(''))
    .filter((d) => d !== slug);
  return [`${slug}.com`, `${slug}.com.tr`, ...doubled.map((d) => `${d}.com`)];
}

// What a shop sells, written after its name ("Teknofish Elektronik", "Mardini Kozmetik").
const SHOP_WORDS = new Set([
  'elektronik', 'kozmetik', 'giyim', 'moda', 'saat', 'triko', 'market', 'aksesuar', 'taki', 'ayakkabi', 'canta',
  'cicek', 'cicekcilik', 'tekstil', 'ceyiz', 'mobilya', 'parfum', 'gida', 'kirtasiye', 'oyuncak', 'butik', 'store', 'shop',
]);

/**
 * "Teknofish Elektronik" -> teknofish.com, teknofish.com.tr (round 18: the shop's address leaves out what it
 * sells). Only when what is left is one word of 7+ letters; the caller accepts such an address only when its
 * homepage names the whole business exactly, never on a looser match.
 */
export function shortDomains(name) {
  const words = fold(name).split(' ').map((w) => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  if (words.length !== 2 || !SHOP_WORDS.has(words[1]) || words[0].length < 7) return [];
  return [`${words[0]}.com`, `${words[0]}.com.tr`];
}

// Trade words in a name, and the OpenStreetMap kinds ("category=type") such a place can have.
const TRADE_KINDS = [
  { words: ['dis', 'dental', 'dentist', 'agiz', 'poliklinik', 'poliklinigi', 'klinik', 'clinic'], kinds: /^(amenity=(dentist|clinic|doctors|hospital)|healthcare=)/, label: 'a clinic' },
  { words: ['kafe', 'cafe', 'coffee', 'kahve', 'pub', 'bar', 'restaurant', 'restoran', 'lokanta', 'meyhane'], kinds: /^(amenity=(cafe|pub|bar|restaurant|fast_food|biergarten|ice_cream|food_court|nightclub)|shop=(coffee|bakery|pastry|confectionery))/, label: 'a cafe, bar or restaurant' },
  { words: ['otel', 'hotel', 'hotels', 'pansiyon', 'motel', 'hostel'], kinds: /^(tourism=(hotel|guest_house|hostel|motel|apartment|chalet|camp_site)|building=hotel)/, label: 'a hotel' },
];

/** "a clothes shop (shop=clothes)" when a map match is not the kind of place the name says; else null. */
export function kindMismatch(name, kind) {
  if (!kind) return null;
  const words = new Set(fold(name).split(' '));
  const trade = TRADE_KINDS.find((t) => t.words.some((w) => words.has(w)));
  if (!trade || trade.kinds.test(kind)) return null;
  return `a ${kind.split('=')[1].replace(/_/g, ' ')} (${kind}), not ${trade.label}`;
}

export const CHECKS = {
  'site.own_site': {
    title: "The domain is the business's own website",
    async run(io, { host, name, city, query, userGiven = false, needSearchTie = false }) {
      const cls = classifyHost(host);
      if (!isValidHostname(host) || cls.kind === 'platform' || userGiven || !name) return ownSiteVerdict(io, { host, name, userGiven, needSearchTie });
      const s = await io.search(query || discoveryQuery({ name, city }), { purpose: 'discover' });
      return ownSiteVerdict(io, { host, name, city, results: s.results || [], searchError: s.error || null, needSearchTie });
    },
  },

  'site.turkish_alternative': {
    title: 'With a bare name, a Turkish site is preferred over one that shows nothing Turkish',
    // Round 14: for "Morfose" the planner chose themorfose.com, the brand's US store; the Turkish business's
    // site is morfose.eu/tr, which morfose.com.tr forwards to. Proofline checks Turkish businesses.
    async run(io, { host, name }) {
      const own = await page(io, `https://${host}/`);
      if (turkeyTie(own, host)) return { pass: null, summary: `${host} is tied to Turkey; nothing to replace`, observed: { host } };
      for (const guess of obviousDomains(name).filter((g) => g !== host)) {
        let v = await ownSiteVerdict(io, { host: guess, name, results: [] });
        let target = guess;
        if (v.pass === true && v.observed.movedTo) {
          target = v.observed.movedTo;
          v = await ownSiteVerdict(io, { host: target, name, results: [] });
        }
        if (v.pass !== true || target === host) continue;
        const t = await page(io, `https://${target}/`);
        if (turkeyTie(t, target)) {
          return { pass: true, summary: `${host} shows nothing tied to Turkey; ${target}${target !== guess ? ` (reached from ${guess})` : ''} is the business's Turkish site: ${v.summary}`, observed: { host: target, from: host } };
        }
      }
      return { pass: false, summary: `${host} shows nothing tied to Turkey, and no Turkish site was found at the address built from the name`, observed: { host } };
    },
  },

  'web.own_site_found': {
    title: 'Search results lead to a website of its own',
    // Looks at every non-platform domain in the discovery results; listings are kept as presence.
    async run(io, { name, city, query, max = 5 }) {
      if (!name) return { pass: null, summary: 'No business name to search for', observed: {} };
      const s = await io.search(query || discoveryQuery({ name, city }), { purpose: 'discover' });
      if (s.error) return { pass: null, summary: `Search failed: ${s.error}`, observed: {} };
      const results = s.results || [];
      if (!results.length) return { pass: null, summary: 'Search returned nothing; cannot say whether a website exists', observed: { results: 0 } };
      const listings = [];
      const candidates = [];
      for (const r of results) {
        if (!namesBusiness(`${r.title || ''} ${r.content || ''}`, name) && !namesBusiness(r.title || '', name)) continue;
        for (const h of [normalizeHost(r.url), ...domainsIn(`${r.title || ''} ${r.content || ''}`)]) {
          if (!h || !isValidHostname(h)) continue;
          if (classifyHost(h).kind === 'platform') { if (h === normalizeHost(r.url)) listings.push(r.url); continue; }
          if (!candidates.includes(h)) candidates.push(h);
        }
      }
      const tried = [];
      // Search can miss a shop's own site (naramica.com came back as Instagram only), so the obvious
      // address built from the name is probed too. It counts only if its homepage names the business.
      const full = obviousDomains(name).filter((h) => !candidates.includes(h));
      const short = shortDomains(name).filter((h) => !candidates.includes(h) && !full.includes(h));
      const guesses = [...full, ...short];
      for (const host of [...candidates.slice(0, max), ...guesses]) {
        const guessed = guesses.includes(host);
        const v = await ownSiteVerdict(io, { host, name, city, results });
        if (guessed && v.pass !== true && !v.observed?.notChecked && !v.observed?.placeUnproven) continue; // a guess that is not theirs is no evidence either way
        // a shortened address ("teknofish.com") that does not name the business outright is someone else's, not a doubt
        if (short.includes(host)) {
          if (v.pass !== true) continue;
          const sp = await page(io, `https://${host}/`);
          if (!okStatus(sp.status) || !exactIdentity(sp, name)) continue; // (also with a city given: a looser match is not enough)
        }
        // A web address read from text that has no DNS record is no website at all (round 9: the Instagram
        // handle "ahit.tr"); it must not keep "no website" from being settled.
        if (!guessed && v.pass === null && !v.observed?.notChecked) {
          const d = await io.dnsLookup(host);
          if (!d.a?.length && !d.aaaa?.length && (!d.error || /ENOTFOUND|ENODATA|NXDOMAIN/i.test(d.error))) {
            tried.push({ host, pass: false, summary: `${host} has no DNS record, so there is no website at that address`, noDns: true });
            continue;
          }
        }
        tried.push({ host, pass: v.pass, summary: v.summary, ...(guessed ? { guessed: true } : {}) });
        if (v.pass === true && v.observed.movedTo) {
          const target = v.observed.movedTo;
          const t = await ownSiteVerdict(io, { host: target, name, city, results });
          if (t.pass === true) return { pass: true, summary: `Own website found: ${host} forwards to ${target}; ${t.summary}`, observed: { host: target, tried, listings, via: 'forwarding address' } };
          tried.push({ host, pass: null, summary: `${host} forwards to ${target}, which is not settled as the business's site` });
          continue;
        }
        if (v.pass === true) return { pass: true, summary: `Own website found: ${v.summary}${guessed ? ' (found by trying the address built from the name)' : ''}`, observed: { host, tried, listings, ...(guessed ? { via: 'name-built address' } : {}) } };
        // A candidate our host could not check leaves the question open: never "no website".
        if (v.observed?.notChecked) return { pass: null, summary: `Not checked: ${v.summary}`, observed: { tried, listings } };
      }
      // A site that names the business but not its city may still be theirs: say so, never "no website".
      const namesake = tried.find((t) => t.pass === null && /namesake/.test(t.summary));
      if (namesake) return { pass: null, summary: `Not settled: ${namesake.summary}`, observed: { tried, listings } };
      // Before "no website", one more search (round 8: lahzaabutik.com, the address doubles the a, was in
      // neither the first results nor the name-built guess). Its finds face the same identity test.
      {
        const again = await io.search(`${name} .com`, { purpose: 'discover-again' });
        for (const r of again.error ? [] : again.results || []) {
          if (!namesBusiness(`${r.title || ''} ${r.content || ''}`, name)) continue;
          const host = normalizeHost(r.url);
          if (!host || !isValidHostname(host) || classifyHost(host).kind === 'platform' || candidates.includes(host) || tried.some((t) => t.host === host)) continue;
          const v = await ownSiteVerdict(io, { host, name, city, results: [...results, r] });
          if (v.pass === true) return { pass: true, summary: `Own website found: ${v.summary} (found by a second search)`, observed: { host, tried, listings, via: 'second search' } };
        }
      }
      // The business's own listings often link its website when search does not show it (round 19: Fiyord's
      // Yandex Maps entry links balikavmarket.net; round 18: teknofish.com). The listing came from the search
      // for this name but may title it differently ("Fiyord Balık & Av Malzemeleri"), so the safeguard is the
      // linked site: it must pass the same identity test, and one that only loosely matches leaves "no website"
      // unsettled. (The listing counts as a search tie only when its result names the business.)
      for (const url of [...new Set(listings)].slice(0, 3)) {
        const r = (results || []).find((x) => x.url === url);
        if (!r) continue;
        const lp = await page(io, url);
        if (!okStatus(lp.status)) continue;
        for (const host of listedWebsites(lp.html)) {
          if (!isValidHostname(host) || classifyHost(host).kind === 'platform' || candidates.includes(host) || tried.some((t) => t.host === host)) continue;
          const tie = { url, title: r.title || name, content: `${r.content || ''} ${host}` };
          const v = await ownSiteVerdict(io, { host, name, city, results: [...results, tie] });
          if (v.pass === true) return { pass: true, summary: `Own website found: ${v.summary} (linked from its listing ${url})`, observed: { host, tried, listings, via: 'listing link' } };
          if (v.pass === null && !v.observed?.notChecked) {
            return { pass: null, summary: `Not settled: its listing ${url} links ${host}: ${v.summary}`, observed: { tried: [...tried, { host, pass: null, summary: v.summary, listingLink: true }], listings } };
          }
          tried.push({ host, pass: v.pass, summary: v.summary, listingLink: true });
        }
      }
      const unloaded = tried.filter((t) => t.pass === null).map((t) => t.host);
      // A one-word name with nothing else ("Shout") belongs to many businesses: not finding a site in its
      // results says nothing about the one the user means (round 6: the Turkish shop has shout.com.tr).
      // (a long, unusual single word such as "Vatkalimon" is specific enough: same 7-letter line as labelIsName)
      if ((!city || looksLikeDomain(city)) && coreTokens(name).length < 2 && fold(name).replace(/ /g, '').length < 7) {
        return { pass: null, summary: `Not settled: only “${name}” was given, a name many businesses share; no own site among ${results.length} result(s) does not show this one has none`, observed: { tried, listings, ambiguousName: true } };
      }
      return {
        pass: false,
        summary: `No website of its own among ${results.length} search result(s)${listings.length ? `; listings only: ${[...new Set(listings)].slice(0, 4).join(', ')}` : ''}${unloaded.length ? `; ${unloaded.join(', ')} did not load and nothing ties it to the business` : ''}`,
        observed: { tried, listings },
      };
    },
  },


  'dns.resolves': {
    title: 'Domain resolves in DNS',
    async run(io, { host }) {
      const r = await io.dnsLookup(host);
      if (r.error && !/ENOTFOUND|ENODATA|NXDOMAIN/i.test(r.error)) {
        return { pass: null, summary: `DNS lookup failed: ${r.error}`, observed: r };
      }
      const n = (r.a || []).length + (r.aaaa || []).length;
      return {
        pass: n > 0,
        summary: n > 0 ? `${host} has ${n} address record(s)` : `${host} has no address records`,
        observed: { a: r.a || [], aaaa: r.aaaa || [] },
      };
    },
  },

  'http.reachable': {
    title: 'Website answers over HTTPS',
    // Two attempts, so one slow response is never reported as "the site is down".
    async run(io, { url }) {
      const attempts = [];
      for (let i = 0; i < 2; i++) {
        const r = await io.fetchPage(url, { attempt: i });
        attempts.push({ status: r.status ?? null, error: r.error ?? null, finalUrl: r.finalUrl ?? null });
        if (okStatus(r.status)) {
          return {
            pass: true,
            summary: `Loaded with HTTP ${r.status}${r.finalUrl && r.finalUrl !== url ? ` (ended at ${r.finalUrl})` : ''}`,
            observed: { attempts, chain: r.chain || [] },
          };
        }
      }
      const last = attempts[attempts.length - 1];
      // Our own host ran out of outbound requests: that says nothing about the site.
      if (attempts.some((a) => isHostLimit(a.error))) {
        return { pass: null, summary: `Not checked: ${last.error}`, observed: { attempts } };
      }
      // The site answered but turned us away (bot wall, rate limit, busy), or our own DNS service failed:
      // neither shows a visitor cannot open it (audit 15 Oct).
      const refused = attempts.find((a) => REFUSED_STATUS.has(a.status));
      if (refused) {
        return { pass: null, summary: `Not checked: the site answered HTTP ${refused.status} (it refuses automated visits or is busy)`, observed: { attempts } };
      }
      const dnsSide = attempts.find((a) => DNS_SERVICE_ERROR.test(a.error || ''));
      if (dnsSide) {
        return { pass: null, summary: `Not checked: the DNS lookup itself failed (${dnsSide.error})`, observed: { attempts } };
      }
      return {
        pass: false,
        summary: `Failed twice: ${last.error || `HTTP ${last.status}`}`,
        observed: { attempts },
      };
    },
  },

  'http.https_redirect': {
    title: 'Plain HTTP upgrades to HTTPS',
    async run(io, { host }) {
      const r = await io.fetchPage(`http://${host}/`);
      if (r.error) return { pass: null, summary: `http:// did not answer: ${r.error}`, observed: { error: r.error } };
      const final = r.finalUrl || '';
      const pass = final.startsWith('https://');
      return {
        pass,
        summary: pass ? `http:// redirects to ${final}` : `http:// stays on plain HTTP (${final || 'no redirect'})`,
        observed: { chain: r.chain || [], finalUrl: final },
      };
    },
  },

  'tls.cert_valid': {
    title: 'TLS certificate is valid',
    async run(io, { host, minDays = 0 }) {
      const r = await io.tlsCert(host);
      if (r.error) return { pass: null, summary: `TLS handshake failed: ${r.error}`, observed: { error: r.error } };
      const via = r.source === 'ct-log' ? ' (expiry read from Certificate Transparency logs)' : '';
      if (!r.validTo) {
        const observed = { validTo: null, authorized: r.authorized ?? null, authorizationError: r.authorizationError || null, source: r.source || null };
        // "not trusted" needs a stated reason; an unreadable date alone proves nothing either way (audit 15 Oct)
        if (r.authorized === false && r.authorizationError) return { pass: false, summary: `Certificate is not trusted: ${r.authorizationError}`, observed };
        return { pass: null, summary: 'Certificate expiry date not available', observed };
      }
      const daysLeft = Math.floor((Date.parse(r.validTo) - Date.now()) / 86400000);
      const pass = !!r.authorized && daysLeft >= minDays;
      const when = daysLeft < 0 ? `expired ${-daysLeft} day(s) ago` : `expires in ${daysLeft} day(s)`;
      return {
        pass,
        summary: `Certificate ${when}${minDays ? ` (needs ≥ ${minDays})` : ''}${r.authorized ? '' : `, not trusted${r.authorizationError ? `: ${r.authorizationError}` : ''}`}${via}`,
        observed: { validTo: r.validTo, daysLeft, issuer: r.issuer || null, authorized: !!r.authorized, source: r.source || null },
      };
    },
  },

  'page.not_parked': {
    title: 'Homepage is a real site, not a parked or placeholder page',
    async run(io, { url }) {
      const p = await page(io, url);
      if (!okStatus(p.status)) return { pass: null, summary: 'Page did not load', observed: { status: p.status ?? null } };
      if (emptyPage(p)) return { pass: false, summary: 'Empty page: no title and almost no text (a placeholder, or a script that jumps elsewhere)', observed: { title: p.title, marker: 'empty page' } };
      const hay = `${p.title}\n${p.text.slice(0, 4000)}`;
      const hit = PARKED.find((re) => re.test(hay));
      return {
        pass: !hit,
        summary: hit ? `Parked/placeholder marker found: “${(hay.match(hit) || [''])[0]}”` : `Real content (title: “${p.title || 'none'}”)`,
        observed: { title: p.title, marker: hit ? (hay.match(hit) || [''])[0] : null },
      };
    },
  },

  'page.contact_path': {
    title: 'Visitors can get in touch from the site',
    async run(io, { url }) {
      const p = await page(io, url);
      if (!okStatus(p.status)) return { pass: null, summary: 'Page did not load', observed: { status: p.status ?? null } };
      const form = elements(p.html, 'form').some((f) => /type=["']email["']|<textarea|name=["'](message|mesaj|email)["']/i.test(f));
      const mailto = /href=["']mailto:/i.test(p.html);
      const tel = /href=["']tel:/i.test(p.html);
      const whatsapp = /wa\.me\/|api\.whatsapp\.com/i.test(p.html);
      // A plain-text address or a labelled phone number is a way to get in touch too.
      const email = EMAIL.test(p.text);
      const phone = labelledPhones(p.text).length > 0;
      const found = [form && 'contact form', mailto && 'email link', tel && 'tap-to-call link', whatsapp && 'WhatsApp link',
        email && 'email address', phone && 'phone number'].filter(Boolean);
      const observed = { form, mailto, tel, whatsapp, email, phone };
      if (!found.length && p.truncated) return notWholePage(observed);
      return {
        pass: found.length > 0,
        summary: found.length ? `Found: ${found.join(', ')}` : 'No form, email, phone or WhatsApp contact on the homepage',
        observed,
      };
    },
  },

  'page.phone_listed': {
    title: 'The phone number appears on the official site',
    async run(io, { url, phone }) {
      const key = phoneKey(phone);
      if (!key) return { pass: null, summary: 'No phone number to look for', observed: {} };
      if (placeholderPhone(phone)) return { pass: null, summary: `${phone} looks like a template's placeholder number, so it proves nothing either way`, observed: { looked_for: key, placeholder: true } };
      const p = await page(io, url);
      if (!okStatus(p.status)) return { pass: null, summary: 'Page did not load', observed: { status: p.status ?? null } };
      const telLinks = [...p.html.matchAll(/href=["']tel:([^"']{1,64})["']/gi)].map((m) => m[1]);
      // (round 16: alestacoffee.com shows its number only in a WhatsApp button and in its structured data)
      for (const m of p.html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\+?\d{10,15})/gi)) telLinks.push(m[1]);
      for (const m of p.html.matchAll(/"telephone"\s*:\s*"([^"]{7,30})"/gi)) telLinks.push(m[1]);
      const onPage = new Set([...extractPhones(p.text), ...telLinks.map(phoneKey).filter(Boolean)]);
      const pass = onPage.has(key);
      if (!pass && p.truncated) return notWholePage({ looked_for: key, on_page: [...onPage] });
      return {
        pass,
        summary: pass ? `${phone} is listed on the site` : `${phone} is not on the site (site lists: ${[...onPage].join(', ') || 'none'})`,
        observed: { looked_for: key, on_page: [...onPage] },
      };
    },
  },

  'page.name_match': {
    title: 'Site name matches the business name',
    async run(io, { url, name, min = 0.45 }) {
      const p = await page(io, url);
      if (!okStatus(p.status)) return { pass: null, summary: 'Page did not load', observed: { status: p.status ?? null } };
      // Same identity rule as site.own_site: og:site_name, title, <h1>, then the body text.
      const id = pageIdentity(p, name, min);
      const siteName = id.value || metaContent(p.html, 'og:site_name') || p.title;
      if (!id.identified && p.truncated) return notWholePage({ site_name: siteName, field: id.field, score: Number(id.score.toFixed(3)) });
      return {
        pass: id.identified,
        summary: id.identified
          ? `The site names “${name}” (${id.field}: “${siteName}”)`
          : `“${siteName || 'untitled'}” vs “${name}”: similarity ${id.score.toFixed(2)} (needs ≥ ${min}), name not found on the page`,
        observed: { site_name: siteName, field: id.field, score: Number(id.score.toFixed(3)) },
      };
    },
  },

  'osm.listed': {
    title: 'Listed on OpenStreetMap under this name',
    async run(io, { name, city, cityGuessed = false, domain = null }) {
      // A domain in the city slot would make the lookup find nothing and read as "not on the map".
      let place = city && !looksLikeDomain(city) ? city : null;
      let at = place ? `, ${place}` : '';
      let r = await io.nominatim(`${name}${at}`);
      if (r.error) return { pass: null, summary: `Map lookup failed: ${r.error}`, observed: {} };
      // Map names often drop words like "Kafe": "Sakal Kafe Pub, Ankara" finds nothing, "Sakal Pub, Ankara" does.
      const core = nameTokens(name).join(' ');
      let retried = false;
      const lookUp = async () => {
        if (!(r.results || []).length && core && core !== fold(name)) {
          const again = await io.nominatim(`${core}${at}`);
          if (again.error) return `Map lookup failed: ${again.error}`;
          r = again;
          retried = true;
        }
        return null;
      };
      let failed = await lookUp();
      if (failed) return { pass: null, summary: failed, observed: {} };
      // A city the user did not type is the planner's guess (round 8: "Köln" for D&P Perfumum, an Istanbul
      // shop). It may narrow the search, but finding nothing there is not "not on the map": search again without it.
      if (!(r.results || []).length && place && cityGuessed) {
        place = null;
        at = '';
        r = await io.nominatim(name);
        if (r.error) return { pass: null, summary: `Map lookup failed: ${r.error}`, observed: {} };
        failed = await lookUp();
        if (failed) return { pass: null, summary: failed, observed: {} };
      }
      const best = (r.results || [])
        .map((x) => ({ ...x, score: nameSimilarity(name, x.name || String(x.display_name || '').split(',')[0]) }))
        .sort((a, b) => b.score - a.score)[0];
      let pass = !!best && best.score >= 0.5;
      // The name says what kind of place it is ("… Diş", "… Kafe", "… Otel"). A match of another kind is a
      // different place (round 3: "Santral Ankara Diş" matched "Santral", a clothes shop).
      const wrongKind = pass ? kindMismatch(name, best.kind) : null;
      if (wrongKind) pass = false;
      // A name that holds the city ("Pet Ankara") leaves one ordinary word once the city is set aside, and
      // "Ankara Pet" is another shop (round 4): then the map name must carry the name in the same order.
      const placeWords = place ? new Set(fold(place).split(' ')) : new Set();
      const holdsCity = nameTokens(name).some((t) => placeWords.has(t));
      const mapName = best ? best.name || String(best.display_name || '').split(',')[0] : '';
      // (one may be part of the other: "Dent-i Konya" for "Dent-i Konya Ağız ve Diş")
      const inOrder = (a, b) => ` ${fold(a)} `.includes(` ${fold(b)} `);
      const reordered = pass && holdsCity && !inOrder(mapName, name) && !inOrder(name, mapName);
      if (reordered) pass = false;
      // With no city, a one-word name found on the map can be anywhere in the world (round 4: "Shout" in
      // Massachusetts, "Loky" in Madagascar): it does not show this business is on the map.
      // (round 12: a place under a city the planner guessed, "North Myrtle Beach", or anywhere abroad for a name
      // given without a city, "MK collection" in Dnipro, is not this business either)
      const inTurkey = /T[üu]rkiye|Turkey/i.test(String(best?.display_name || ''));
      const typedPlace = place && !cityGuessed;
      const untied = pass && !typedPlace && (coreTokens(name).length < 2 || !inTurkey);
      if (untied) pass = null;
      // A business can be on the map under the brand its own site goes by (round 19: Yöresel Bakkal's Bostanlı
      // store is "Tereci", the name in its Instagram link). Before "not on the map", look up those names too, in
      // the city the user typed; a hit there leaves the claim not settled either way.
      if (pass === false && domain && typedPlace) {
        const alias = await mapUnderAlias(io, { name, domain, place });
        if (alias) {
          return {
            pass: null,
            summary: `Not settled: no “${name}” on OpenStreetMap, but “${alias.hit.name}” (${alias.hit.display_name}) matches “${alias.alias}”, a name ${domain} uses`,
            observed: { alias: alias.alias, name: alias.hit.name, display_name: alias.hit.display_name, lat: alias.hit.lat, lon: alias.hit.lon, kind: alias.hit.kind || null },
          };
        }
      }
      return {
        pass,
        summary: untied ? `Found “${best.name}” (${best.display_name}), but ${typedPlace ? 'it' : 'with no city typed'}${inTurkey ? '' : ' it is outside Turkey and'} nothing ties this place to the business`
          : pass ? `Found “${best.name}” (${best.display_name})`
          : wrongKind ? `Only “${best.name}” matched, and it is ${wrongKind}; no matching place on OpenStreetMap`
          : reordered ? `Only “${mapName}” matched: the same words in another order, so another place; no matching place on OpenStreetMap` : 'No matching place on OpenStreetMap',
        observed: best ? {
          name: best.name, display_name: best.display_name, lat: best.lat, lon: best.lon,
          osm: best.osm_type && best.osm_id ? `${best.osm_type}/${best.osm_id}` : null,
          phone: best.phone || null, website: best.website || null, score: Number(best.score.toFixed(3)), kind: best.kind || null,
          ...(retried ? { query: `${core}${at}` } : {}),
        } : (retried ? { query: `${core}${at}` } : {}),
      };
    },
  },

  'web.no_closure_signal': {
    title: 'No public sign the business has closed',
    // Tavily search; a closure phrase only counts when the same result also names the business.
    async run(io, { name, city, domain = null }) {
      // a name with no letters we can compare (all Cyrillic, all symbols) would match every closure phrase
      const folded = fold(name);
      if (!folded) return { pass: null, summary: 'Not checked: the name has no letters this check can match', observed: {} };
      const r = await io.search(`"${name}" ${city || ''} permanently closed`.trim(), { purpose: 'closure' });
      if (r.error) return { pass: null, summary: `Search failed: ${r.error}`, observed: {} };
      const hits = [];
      for (const x of r.results || []) {
        const hay = `${x.title || ''} ${x.content || ''}`;
        const re = CLOSURE.find((c) => c.test(hay));
        // whole words only: "Ada" is not in "Canada", "Mola" not in "Molalar" (audit 15 Oct)
        const namesIt = nameSimilarity(name, x.title || '') >= 0.4 || ` ${fold(hay)} `.includes(` ${folded} `);
        if (re && namesIt) {
          hits.push({ url: x.url, title: x.title, phrase: (hay.match(re) || [''])[0] });
        }
      }
      // One page saying "closed" is weak against the business's own website still up and showing real content:
      // that is usually one branch or an old entry (round 19: Apple Maps calls one Tereci Yöresel Bakkal branch
      // "Permanently Closed" while its site sells and lists four İzmir stores open every day).
      if (hits.length && domain) {
        const own = await page(io, `https://${domain}/`);
        if (okStatus(own.status) && !isParked(own) && (own.text || '').trim().length > 200) {
          return { pass: null, summary: `Not settled: “${hits[0].phrase}” on ${hits[0].url}, but ${domain} is up and shows real content, so this may be one branch or an old entry`, observed: { hits, results: (r.results || []).length, ownSiteUp: domain } };
        }
      }
      return {
        pass: hits.length === 0,
        summary: hits.length ? `Closure signal: “${hits[0].phrase}” on ${hits[0].url}` : `No closure signal in ${(r.results || []).length} search result(s)`,
        observed: { hits, results: (r.results || []).length },
      };
    },
  },
};

export async function runCheck(io, id, params) {
  const def = Object.hasOwn(CHECKS, id) ? CHECKS[id] : null;
  if (!def) return { pass: null, summary: `Unknown check ${id}`, observed: {} };
  const started = Date.now();
  try {
    const out = await def.run(io, params || {});
    return { check: id, title: def.title, params, ...out, ms: Date.now() - started, at: new Date().toISOString() };
  } catch (err) {
    return { check: id, title: def.title, params, pass: null, summary: `Check crashed: ${err.message}`, observed: {}, ms: Date.now() - started, at: new Date().toISOString() };
  }
}
