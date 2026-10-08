// Live I/O: DNS, HTTP(S), TLS, OpenStreetMap Nominatim, Tavily search.
// Network rules: short timeouts, small bodies, no private addresses (SSRF guard),
// Nominatim limited to 1 request per second with an identifying User-Agent.
//
// Platform-neutral: DNS and TLS go through a small `net` adapter, so the same code runs on Node
// (src/io/net-node.mjs: getaddrinfo, node:tls) and on Cloudflare Workers (src/io/net-worker.mjs:
// DNS-over-HTTPS, TLS trust from the fetch handshake, expiry from Certificate Transparency).

const UA = 'Proofline/0.1 (+https://github.com/jpalii77/proofline; business profile verifier)';
const MAX_BODY = 400_000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const isIPv4 = (s) => IPV4.test(String(s)) && String(s).split('.').every((n) => Number(n) <= 255);
export const isIPv6 = (s) => String(s).includes(':') && /^[0-9a-f:.]+$/i.test(String(s));
export const isIP = (s) => isIPv4(s) || isIPv6(s);

export function isPrivateAddress(ip) {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80')
      || x.startsWith('::ffff:') && isPrivateAddress(x.slice(7));
  }
  return true;
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
    async fetchPage(url) {
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
          const read = /text\/html|xhtml|text\/plain/i.test(res.headers.get('content-type') || 'text/html') ? await readCapped(res) : { text: '', truncated: false };
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
      return tavily.search(query, opts);
    },
  };
}
