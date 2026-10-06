// Evidence checks. Each check is a small, re-runnable probe of the outside world.
//
//   run(io, params) -> { pass: true | false | null, summary, observed }
//
// pass === null means "inconclusive" (timeout, missing data). A claim never rests on an
// inconclusive check: the gate treats null as "not proven".
// Checks only read public business information. They never store personal data.

import {
  extractPhones, fold, metaContent, nameSimilarity, pageTitle, phoneKey, visibleText,
} from './text.mjs';

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

export const CHECKS = {
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
      const daysLeft = Math.floor((Date.parse(r.validTo) - Date.now()) / 86400000);
      const pass = !!r.authorized && daysLeft >= minDays;
      const when = daysLeft < 0 ? `expired ${-daysLeft} day(s) ago` : `expires in ${daysLeft} day(s)`;
      return {
        pass,
        summary: `Certificate ${when}${minDays ? ` (needs ≥ ${minDays})` : ''}`,
        observed: { validTo: r.validTo, daysLeft, issuer: r.issuer || null, authorized: !!r.authorized },
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
      const found = [form && 'contact form', mailto && 'email link', tel && 'tap-to-call link', whatsapp && 'WhatsApp link'].filter(Boolean);
      return {
        pass: found.length > 0,
        summary: found.length ? `Found: ${found.join(', ')}` : 'No form, email, tap-to-call or WhatsApp link on the homepage',
        observed: { form, mailto, tel, whatsapp },
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
      const siteName = metaContent(p.html, 'og:site_name') || p.title;
      const score = nameSimilarity(name, siteName);
      return {
        pass: score >= min,
        summary: `“${siteName || 'untitled'}” vs “${name}”: similarity ${score.toFixed(2)} (needs ≥ ${min})`,
        observed: { site_name: siteName, score: Number(score.toFixed(3)) },
      };
    },
  },

  'osm.listed': {
    title: 'Listed on OpenStreetMap under this name',
    async run(io, { name, city }) {
      const r = await io.nominatim(`${name}${city ? `, ${city}` : ''}`);
      if (r.error) return { pass: null, summary: `Map lookup failed: ${r.error}`, observed: {} };
      const best = (r.results || [])
        .map((x) => ({ ...x, score: nameSimilarity(name, x.name || x.display_name) }))
        .sort((a, b) => b.score - a.score)[0];
      const pass = !!best && best.score >= 0.5;
      return {
        pass,
        summary: pass ? `Found “${best.name}” (${best.display_name})` : 'No matching place on OpenStreetMap',
        observed: best ? {
          name: best.name, display_name: best.display_name, lat: best.lat, lon: best.lon,
          osm: best.osm_type && best.osm_id ? `${best.osm_type}/${best.osm_id}` : null,
          phone: best.phone || null, website: best.website || null, score: Number(best.score.toFixed(3)),
        } : {},
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
