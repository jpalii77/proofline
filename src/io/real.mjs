// Live I/O: DNS, HTTP(S), TLS, OpenStreetMap Nominatim, Tavily search.
// Network rules: short timeouts, small bodies, no private addresses (SSRF guard),
// Nominatim limited to 1 request per second with an identifying User-Agent.

import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

const UA = 'Proofline/0.1 (+https://github.com/; business profile verifier)';
const MAX_BODY = 400_000;

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80')
      || x.startsWith('::ffff:') && isPrivateAddress(x.slice(7));
  }
  return true;
}

async function assertPublicHost(host) {
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private address refused');
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('private address refused');
}

async function readCapped(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8').slice(0, MAX_BODY);
}

let lastNominatim = 0;
async function nominatimSlot() {
  const wait = lastNominatim + 1100 - Date.now();
  lastNominatim = Math.max(Date.now(), lastNominatim + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export function createRealIO({ tavily, nominatimContact = '', fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  return {
    mode: 'live',

    async dnsLookup(host) {
      const out = { a: [], aaaa: [] };
      try { out.a = await dns.resolve4(host); } catch (e) { out.error = e.code || e.message; }
      try { out.aaaa = await dns.resolve6(host); } catch { /* optional */ }
      if (out.a.length || out.aaaa.length) delete out.error;
      return out;
    },

    // Follows up to 5 redirects by hand so the chain can be shown as evidence.
    async fetchPage(url) {
      const chain = [];
      let current = url;
      try {
        for (let hop = 0; hop < 6; hop++) {
          const u = new URL(current);
          if (!/^https?:$/.test(u.protocol)) throw new Error('unsupported protocol');
          await assertPublicHost(u.hostname);
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
          const body = /text\/html|xhtml|text\/plain/i.test(res.headers.get('content-type') || 'text/html') ? await readCapped(res) : '';
          return { status: res.status, finalUrl: current, chain, body };
        }
        return { status: null, finalUrl: current, chain, error: 'too many redirects' };
      } catch (e) {
        return { status: null, finalUrl: current, chain, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message) };
      }
    },

    async tlsCert(host) {
      try { await assertPublicHost(host); } catch (e) { return { error: e.message }; }
      return new Promise((resolve) => {
        const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
          const c = socket.getPeerCertificate();
          resolve({
            validTo: c && c.valid_to ? new Date(c.valid_to).toISOString() : null,
            issuer: c?.issuer?.O || c?.issuer?.CN || null,
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
          });
          socket.end();
        });
        socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
        socket.on('error', (e) => resolve({ error: e.code || e.message }));
      });
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
