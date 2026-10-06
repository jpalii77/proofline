// Node network adapter for src/io/real.mjs: system DNS and a direct TLS handshake.

import dns from 'node:dns/promises';
import tls from 'node:tls';

export function createNodeNet() {
  return {
    kind: 'node',

    async lookup(host) {
      return (await dns.lookup(host, { all: true })).map((a) => a.address);
    },

    async resolve(host) {
      const out = { a: [], aaaa: [] };
      try { out.a = await dns.resolve4(host); } catch (e) { out.error = e.code || e.message; }
      try { out.aaaa = await dns.resolve6(host); } catch { /* optional */ }
      if (out.a.length || out.aaaa.length) delete out.error;
      return out;
    },

    // Reads the certificate the server actually presents.
    tlsCert(host, { timeoutMs = 8000 } = {}) {
      return new Promise((resolve) => {
        const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
          const c = socket.getPeerCertificate();
          resolve({
            validTo: c && c.valid_to ? new Date(c.valid_to).toISOString() : null,
            issuer: c?.issuer?.O || c?.issuer?.CN || null,
            authorized: socket.authorized,
            authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
            source: 'handshake',
          });
          socket.end();
        });
        socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
        socket.on('error', (e) => resolve({ error: e.code || e.message }));
      });
    },
  };
}
