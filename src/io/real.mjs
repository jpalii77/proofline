// Live I/O: DNS, HTTP(S), TLS, OpenStreetMap Nominatim, Tavily search.
// Network rules: short timeouts, small bodies, no private addresses (SSRF guard),
// Nominatim limited to 1 request per second with an identifying User-Agent.
//
// Platform-neutral: DNS and TLS go through a small `net` adapter, so the same code runs on Node
// (src/io/net-node.mjs: getaddrinfo, node:tls) and on Cloudflare Workers (src/io/net-worker.mjs:
// DNS-over-HTTPS, TLS trust from the fetch handshake, expiry from Certificate Transparency).

import { DISCOVERY_RESULTS } from '../checks.mjs';

const UA = 'Proofline/0.1 (+https://github.com/jpalii77/proofline; business profile verifier)';
const MAX_BODY = 400_000;
// A caller may ask to read one page further (checks.mjs: a city named only deep in a long homepage), never past this.
const DEEP_MAX_BODY = 2_000_000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const isIPv4 = (s) => IPV4.test(String(s)) && String(s).split('.').every((n) => Number(n) <= 255);
export const isIPv6 = (s) => String(s).includes(':') && /^[0-9a-f:.]+$/i.test(String(s));
export const isIP = (s) => isIPv4(s) || isIPv6(s);

export function isPrivateAddress(ip) {
  if (isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
      || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0);
  }
  if (isIPv6(ip)) {
    // Compared as numbers, not text: new URL() writes [::ffff:127.0.0.1] as ::ffff:7f00:1, which the
    // old prefix test let through (audit 15 Oct). An address we cannot read is refused.
    const h = ipv6Hextets(ip);
    if (!h) return true;
    const embedded = `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
    const zeros = (n) => h.slice(0, n).every((x) => x === 0);
    if (zeros(8) || (zeros(7) && h[7] === 1)) return true; // :: and ::1
    if (zeros(5) && h[5] === 0xffff) return isPrivateAddress(embedded); // ::ffff:a.b.c.d (IPv4-mapped)
    if (zeros(6)) return isPrivateAddress(embedded); // ::a.b.c.d (IPv4-compatible)
    if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every((x) => x === 0)) return isPrivateAddress(embedded); // NAT64
    return (h[0] & 0xfe00) === 0xfc00 // fc00::/7 unique local
      || (h[0] & 0xffc0) === 0xfe80 // fe80::/10 link-local
      || (h[0] & 0xffc0) === 0xfec0 // fec0::/10 site-local
      || (h[0] & 0xff00) === 0xff00 // multicast
      || (h[0] === 0x2001 && h[1] === 0x0db8); // documentation
  }
  return true;
}

/** "::ffff:7f00:1" -> [0,0,0,0,0,0xffff,0x7f00,1]; a trailing dotted IPv4 counts as two groups. Null if unreadable. */
function ipv6Hextets(ip) {
  let x = String(ip).toLowerCase().replace(/%.*$/, '');
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(x);
  if (v4) {
    if (!isIPv4(v4[1])) return null;
    const [a, b, c, d] = v4[1].split('.').map(Number);
    x = `${x.slice(0, -v4[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = x.split('::');
  if (halves.length > 2) return null;
  const part = (p) => (p ? p.split(':') : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/** Throws unless every address the host resolves to is public. `lookup` returns string[] of IPs. */
export async function assertPublicHost(host, lookup) {
  const bare = String(host).replace(/^\[|\]$/g, '');
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) throw new Error('private address refused');
    return;
  }
  const addrs = await lookup(host);
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a))) throw new Error('private address refused');
}

// Returns { text, truncated }. A truncated page can prove presence, never absence (checks.mjs).
export async function readCapped(res, max = MAX_BODY) {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let size = 0;
  let truncated = false;
  for (;;) {
    if (size >= max) { truncated = true; break; }
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    out += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  out += decoder.decode();
  if (out.length > max) { out = out.slice(0, max); truncated = true; }
  return { text: out, truncated };
}

let lastNominatim = 0;
async function nominatimSlot() {
  const wait = lastNominatim + 1100 - Date.now();
  lastNominatim = Math.max(Date.now(), lastNominatim + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export function createRealIO({ net, tavily, nominatimContact = '', fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (!net) throw new Error('createRealIO needs a net adapter (net-node.mjs or net-worker.mjs)');
  const guard = (host) => assertPublicHost(host, (h) => net.lookup(h));
  return {
    mode: 'live',
    host: net.kind,

    async dnsLookup(host) {
      return net.resolve(host);
    },

    // Follows up to 5 redirects by hand so the chain can be shown as evidence.
    async fetchPage(url, { maxBytes } = {}) {
      const chain = [];
      let current = url;
      try {
        for (let hop = 0; hop < 6; hop++) {
          const u = new URL(current);
          if (!/^https?:$/.test(u.protocol)) throw new Error('unsupported protocol');
          await guard(u.hostname);
          const res = await fetchImpl(current, {
            redirect: 'manual',
            headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' },
            signal: AbortSignal.timeout(timeoutMs),
          });
          chain.push({ url: current, status: res.status });
          const loc = res.headers.get('location');
          if (res.status >= 300 && res.status < 400 && loc) {
            current = new URL(loc, current).toString();
            continue;
          }
          const read = /text\/html|xhtml|text\/plain/i.test(res.headers.get('content-type') || 'text/html') ? await readCapped(res, Math.min(maxBytes || MAX_BODY, DEEP_MAX_BODY)) : { text: '', truncated: false };
          return { status: res.status, finalUrl: current, chain, body: read.text, ...(read.truncated ? { truncated: true } : {}) };
        }
        return { status: null, finalUrl: current, chain, error: 'too many redirects' };
      } catch (e) {
        return { status: null, finalUrl: current, chain, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message) };
      }
    },

    async tlsCert(host) {
      try { await guard(host); } catch (e) { return { error: e.message }; }
      return net.tlsCert(host, { timeoutMs });
    },

    async nominatim(query) {
      await nominatimSlot();
      const u = new URL('https://nominatim.openstreetmap.org/search');
      u.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', extratags: '1', addressdetails: '0' }).toString();
      try {
        const res = await fetchImpl(u, {
          headers: { 'user-agent': `${UA}${nominatimContact ? ` contact:${nominatimContact}` : ''}`, 'accept-language': 'en' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const rows = await res.json();
        return {
          results: rows.map((r) => ({
            name: r.name, display_name: r.display_name, lat: r.lat, lon: r.lon, osm_type: r.osm_type, osm_id: r.osm_id,
            kind: r.category && r.type ? `${r.category}=${r.type}` : null,
            phone: r.extratags?.phone || r.extratags?.['contact:phone'] || null,
            website: r.extratags?.website || r.extratags?.['contact:website'] || null,
          })),
        };
      } catch (e) {
        return { error: e.message };
      }
    },

    async search(query, opts = {}) {
      if (!tavily) return { error: 'Tavily is not configured' };
      // Discovery reads 10 results (the own site is often not in the top 5); the closure check keeps 5.
      const { purpose, ...rest } = opts;
      return tavily.search(query, (purpose === 'discover' || purpose === 'discover-again') ? { maxResults: DISCOVERY_RESULTS, ...rest } : rest);
    },
  };
}
