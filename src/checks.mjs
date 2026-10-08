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
  canonName, domainsIn, extractPhones, fold, headings, looksLikeDomain, metaContent, nameSimilarity, nameTokens, normalizeHost,
  pageTitle, phoneKey, visibleText,
} from './text.mjs';

/** The discovery search. The pipeline and the own-site checks use the same query. */
export function discoveryQuery({ name, city, domain } = {}) {
  if (!name && domain) return `${domain} business contact`;
  return `${name || ''} ${city || ''} official website phone`.replace(/\s+/g, ' ').trim();
}

// Parking, for-sale, suspended and placeholder pages. Matched on the title and the visible text.
const PARKED = [
  /\b(this )?domain (name )?(is|may be) for sale\b/i,
  /\bbuy this domain\b/i,
  /\bmake an offer\b.*\bdomain\b/i,
  /\bhugedomains\b|\bsedo(parking)?\b|\bafternic\b|\bparkingcrew\b|\bbodis\b|\bdan\.com\b/i,
  /\baccount (has been )?suspended\b/i,
  /\bdefault web page\b|\bwelcome to nginx\b|^it works!?$/i,
  /\bindex of \//i,
  /\balan ad[ıi] sat[ıi]l[ıi]kt[ıi]r\b|\bsat[ıi]l[ıi]k alan ad[ıi]\b/i,
  /\bcoming soon\b|\bçok yakında\b/i,
];

const CLOSURE = [
  /\bpermanently closed\b/i,
  /\bclosed (its doors|for good|down)\b/i,
  /\bkal[ıi]c[ıi] olarak kapan/i,
  /\bkapand[ıi]\b/i,
  /\bout of business\b/i,
];

function okStatus(s) { return typeof s === 'number' && s >= 200 && s < 400; }

// Pages get a second attempt too: one timeout must not decide anything.
async function page(io, url) {
  let r = await io.fetchPage(url);
  if (!okStatus(r.status)) r = await io.fetchPage(url, { attempt: 1 });
  const html = r.body || '';
  return { ...r, html, title: pageTitle(html), text: visibleText(html) };
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

/** Does the homepage itself say whose site this is? Title, og:site_name, <h1>, then body text. */
function pageIdentity(p, name, min = NAME_MIN) {
  const fields = [['og:site_name', metaContent(p.html, 'og:site_name')], ['title', p.title], ...headings(p.html).slice(0, 3).map((x) => ['h1', x])]
    .filter(([, v]) => v);
  let best = { field: null, value: '', score: 0 };
  for (const [field, value] of fields) {
    // A long title ("Sakal Café — Kahve & Kahvaltı, Ankara") still names the business when it
    // contains every distinctive word of the name.
    const score = tokensContained(name, value) ? 1 : nameSimilarity(name, value);
    if (score > best.score) best = { field, value, score };
  }
  if (best.score >= min) return { identified: true, ...best };
  if (canonName(name).length > 2 && ` ${canonName(p.text.slice(0, 20000))} `.includes(` ${canonName(name)} `)) {
    return { identified: true, field: 'body', value: name, score: best.score };
  }
  return { identified: false, ...best };
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
  return tokens.length > 0 && tokens.every((t) => label.includes(t));
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

  const ties = searchTies(results, host, name);
  if (needSearchTie) {
    return ties.length
      ? { pass: true, summary: `${host} is tied to “${name}”: ${ties[0].how} (${ties[0].url})`, observed: { host, ties } }
      : { pass: searchError ? null : false, summary: searchError ? `Search failed: ${searchError}` : `No search result ties ${host} to “${name}”; a different name on an unverified site is not evidence of a rename`, observed: { host, ties } };
  }

  const p = await page(io, `https://${host}/`);
  const loaded = okStatus(p.status);
  const id = loaded ? pageIdentity(p, name) : { identified: false };
  if (id.identified || ties.length) {
    // A name alone can belong to a namesake elsewhere (petpal.com is a US network, not the Bursa shop):
    // with a city given, the page or a search result showing this site must name that city too.
    const place = city && !looksLikeDomain(city) ? placeTie(loaded ? p : null, results, host, city) : 'no city given';
    if (!place) {
      return { pass: null, summary: `${host} uses the name “${name}” but nothing on it or in search ties it to ${city}; it may be a namesake`, observed: { host, identity: id, ties, placeUnproven: true } };
    }
    const why = id.identified ? `names the business (${id.field}: “${id.value}”)` : `is tied to “${name}”: ${ties[0].how} (${ties[0].url})`;
    return { pass: true, summary: `${host} ${why}`, observed: { host, identity: id, ties, ...(city ? { place } : {}) } };
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

/** "Naramica" -> naramica.com, naramica.com.tr. Short or generic names are not guessed (elle.com is a magazine). */
export function obviousDomains(name) {
  const slug = fold(name).replace(/[^a-z0-9]/g, '');
  if (slug.length < 7 || !nameTokens(name).length) return [];
  return [`${slug}.com`, `${slug}.com.tr`];
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
      const guesses = obviousDomains(name).filter((h) => !candidates.includes(h));
      for (const host of [...candidates.slice(0, max), ...guesses]) {
        const guessed = guesses.includes(host);
        const v = await ownSiteVerdict(io, { host, name, city, results });
        if (guessed && v.pass !== true && !v.observed?.notChecked && !v.observed?.placeUnproven) continue; // a guess that is not theirs is no evidence either way
        tried.push({ host, pass: v.pass, summary: v.summary, ...(guessed ? { guessed: true } : {}) });
        if (v.pass === true) return { pass: true, summary: `Own website found: ${v.summary}${guessed ? ' (found by trying the address built from the name)' : ''}`, observed: { host, tried, listings } };
        // A candidate our host could not check leaves the question open: never "no website".
        if (v.observed?.notChecked) return { pass: null, summary: `Not checked: ${v.summary}`, observed: { tried, listings } };
      }
      // A site that names the business but not its city may still be theirs: say so, never "no website".
      const namesake = tried.find((t) => t.pass === null && /namesake/.test(t.summary));
      if (namesake) return { pass: null, summary: `Not settled: ${namesake.summary}`, observed: { tried, listings } };
      const unloaded = tried.filter((t) => t.pass === null).map((t) => t.host);
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
        if (r.authorized === false) return { pass: false, summary: `Certificate is not trusted${r.authorizationError ? `: ${r.authorizationError}` : ''}`, observed };
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
      const form = /<form[\s\S]*?(type=["']email["']|<textarea|name=["'](message|mesaj|email)["'])[\s\S]*?<\/form>/i.test(p.html);
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
      const p = await page(io, url);
      if (!okStatus(p.status)) return { pass: null, summary: 'Page did not load', observed: { status: p.status ?? null } };
      const telLinks = [...p.html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => m[1]);
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
    async run(io, { name, city }) {
      // A domain in the city slot would make the lookup find nothing and read as "not on the map".
      const place = city && !looksLikeDomain(city) ? city : null;
      const at = place ? `, ${place}` : '';
      let r = await io.nominatim(`${name}${at}`);
      if (r.error) return { pass: null, summary: `Map lookup failed: ${r.error}`, observed: {} };
      // Map names often drop words like "Kafe": "Sakal Kafe Pub, Ankara" finds nothing, "Sakal Pub, Ankara" does.
      const core = nameTokens(name).join(' ');
      let retried = false;
      if (!(r.results || []).length && core && core !== fold(name)) {
        const again = await io.nominatim(`${core}${at}`);
        if (again.error) return { pass: null, summary: `Map lookup failed: ${again.error}`, observed: {} };
        r = again;
        retried = true;
      }
      const best = (r.results || [])
        .map((x) => ({ ...x, score: nameSimilarity(name, x.name || String(x.display_name || '').split(',')[0]) }))
        .sort((a, b) => b.score - a.score)[0];
      const pass = !!best && best.score >= 0.5;
      return {
        pass,
        summary: pass ? `Found “${best.name}” (${best.display_name})` : 'No matching place on OpenStreetMap',
        observed: best ? {
          name: best.name, display_name: best.display_name, lat: best.lat, lon: best.lon,
          osm: best.osm_type && best.osm_id ? `${best.osm_type}/${best.osm_id}` : null,
          phone: best.phone || null, website: best.website || null, score: Number(best.score.toFixed(3)),
          ...(retried ? { query: `${core}${at}` } : {}),
        } : (retried ? { query: `${core}${at}` } : {}),
      };
    },
  },

  'web.no_closure_signal': {
    title: 'No public sign the business has closed',
    // Tavily search; a closure phrase only counts when the same result also names the business.
    async run(io, { name, city }) {
      const r = await io.search(`"${name}" ${city || ''} permanently closed`.trim(), { purpose: 'closure' });
      if (r.error) return { pass: null, summary: `Search failed: ${r.error}`, observed: {} };
      const hits = [];
      for (const x of r.results || []) {
        const hay = `${x.title || ''} ${x.content || ''}`;
        const re = CLOSURE.find((c) => c.test(hay));
        const namesIt = nameSimilarity(name, x.title || '') >= 0.4 || fold(hay).includes(fold(name));
        if (re && namesIt) {
          hits.push({ url: x.url, title: x.title, phrase: (hay.match(re) || [''])[0] });
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
  const def = CHECKS[id];
  if (!def) return { pass: null, summary: `Unknown check ${id}`, observed: {} };
  const started = Date.now();
  try {
    const out = await def.run(io, params || {});
    return { check: id, title: def.title, params, ...out, ms: Date.now() - started, at: new Date().toISOString() };
  } catch (err) {
    return { check: id, title: def.title, params, pass: null, summary: `Check crashed: ${err.message}`, observed: {}, ms: Date.now() - started, at: new Date().toISOString() };
  }
}
