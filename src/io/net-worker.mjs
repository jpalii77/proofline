// Cloudflare Workers network adapter for src/io/real.mjs. Workers have no getaddrinfo and no raw
// TLS peer-certificate API, so the same evidence is gathered another way:
//
//   DNS      DNS-over-HTTPS (Cloudflare 1.1.1.1 JSON API). Same A/AAAA answers, same NXDOMAIN rule.
//   TLS      Trust: a fetch to https://host/ — Workers' TLS client verifies the chain and hostname,
//            so any HTTP answer means the certificate is trusted; a certificate error means it is not.
//            Expiry: the newest unexpired, non-revoked certificate for the exact host in public
//            Certificate Transparency logs (Cert Spotter API). This is the certificate the CA issued
//            most recently, which is almost always the one being served, but it is not read from
//            the handshake itself; the evidence says so ("source": "ct-log").
//
// Every network call is counted against a per-request budget, because the Workers free plan allows
// 50 outbound requests per incoming request. A check that would exceed it comes back inconclusive.

const DOH = 'https://cloudflare-dns.com/dns-query';
const CT = 'https://api.certspotter.com/v1/issuances';
const CERT_ERROR = /cert|ssl|tls|handshake|self.signed|expired|hostname|x509|526|525/i;

/** Wraps fetch so at most `limit` calls go out; later calls throw a clear error. */
export function budgetFetch(fetchImpl, limit) {
  let used = 0;
  const f = (...args) => {
    if (used >= limit) return Promise.reject(new Error('request budget for this run used up'));
    used++;
    return fetchImpl(...args);
  };
  f.used = () => used;
  return f;
}

async function doh(fetchImpl, name, type, timeoutMs) {
  const u = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetchImpl(u, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  const j = await res.json();
  const want = type === 'A' ? 1 : 28;
  return { status: j.Status, answers: (j.Answer || []).filter((a) => a.type === want).map((a) => a.data) };
}

/** Pick the newest unexpired, non-revoked CT issuance whose names cover `host`. */
export function pickIssuance(rows, host, now = Date.now()) {
  const h = String(host).toLowerCase();
  const parent = h.split('.').slice(1).join('.');
  const covers = (names) => (names || []).some((n) => {
    const x = String(n).toLowerCase();
    return x === h || (parent && x === `*.${parent}`);
  });
  return (rows || [])
    .filter((r) => !r.revoked && covers(r.dns_names) && Date.parse(r.not_after) > now)
    .sort((a, b) => Date.parse(b.not_before) - Date.parse(a.not_before))[0] || null;
}

export function createWorkerNet({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const lookups = new Map(); // SSRF-guard lookups, memoised per run

  return {
    kind: 'cloudflare-workers',

    lookup(host) {
      if (!lookups.has(host)) {
        lookups.set(host, doh(fetchImpl, host, 'A', timeoutMs).then((r) => {
          if (r.status === 3) throw new Error('ENOTFOUND');
          return r.answers;
        }));
      }
      return lookups.get(host);
    },

    async resolve(host) {
      const out = { a: [], aaaa: [] };
      try {
        const a = await doh(fetchImpl, host, 'A', timeoutMs);
        if (a.status === 3) out.error = 'ENOTFOUND';
        else if (a.status !== 0) out.error = `DNS status ${a.status}`;
        out.a = a.answers;
      } catch (e) { out.error = e.message; }
      if (out.error !== 'ENOTFOUND') {
        try { out.aaaa = (await doh(fetchImpl, host, 'AAAA', timeoutMs)).answers; } catch { /* optional */ }
      }
      if (out.a.length || out.aaaa.length) delete out.error;
      else if (!out.error) out.error = 'ENODATA';
      return out;
    },

    async tlsCert(host, { timeoutMs: t = timeoutMs } = {}) {
      // 1. Trust, from the handshake Workers' own TLS client performs.
      let authorized;
      let authorizationError = null;
      try {
        const res = await fetchImpl(`https://${host}/`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(t) });
        res.body?.cancel().catch(() => {});
        // Workers' TLS client answers 526 (invalid certificate) or 525 (handshake failed) itself
        // for expired, self-signed and wrong-host certificates (tested against badssl.com).
        if (res.status === 526 || res.status === 525) { authorized = false; authorizationError = `rejected by Cloudflare's TLS client (HTTP ${res.status}: ${res.status === 526 ? 'invalid certificate' : 'handshake failed'})`; }
        else authorized = true;
      } catch (e) {
        const msg = e.cause?.message || e.message || String(e);
        if (/budget/.test(msg)) return { error: msg };
        if (e.name === 'TimeoutError') return { error: 'timeout' };
        if (!CERT_ERROR.test(msg)) return { error: msg };
        authorized = false;
        authorizationError = msg.slice(0, 160);
      }
      // 2. Expiry, from Certificate Transparency.
      let row = null;
      let ctError = null;
      try {
        const u = `${CT}?domain=${encodeURIComponent(host)}&expand=dns_names&expand=issuer`;
        const res = await fetchImpl(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(t) });
        if (!res.ok) ctError = `CT log HTTP ${res.status}`;
        else row = pickIssuance(await res.json(), host);
      } catch (e) { ctError = e.message; }
      return {
        validTo: row ? new Date(row.not_after).toISOString() : null,
        issuer: row?.issuer?.friendly_name || row?.issuer?.name || null,
        authorized,
        authorizationError: authorizationError || (row || authorized === false ? null : (ctError || 'no unexpired certificate for this host in CT logs')),
        source: 'ct-log',
      };
    },
  };
}
