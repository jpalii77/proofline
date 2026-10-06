// Recorded I/O for SAMPLE_MODE. Same interface as the live I/O, backed by fixtures/sample/*.json.
// The businesses and domains in the fixtures are fictional (".example" is a reserved TLD).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold } from '../text.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'sample');

export function loadSamples(dir = DIR) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function findSample(samples, query) {
  const q = fold(query);
  if (!q) return null;
  return samples.find((s) => s.id === query)
    || samples.find((s) => [s.input, s.domain, s.name, ...(s.aliases || [])].some((x) => x && (fold(x) === q || fold(x).includes(q) || q.includes(fold(x)))))
    || null;
}

export function createSampleIO(sample) {
  const io = sample.io || {};
  const notRecorded = (what) => ({ error: `not recorded in sample: ${what}` });
  return {
    mode: 'sample',
    async dnsLookup(host) {
      return io.dns?.[host] || { a: [], aaaa: [], error: 'ENOTFOUND' };
    },
    async fetchPage(url, { attempt = 0 } = {}) {
      const rec = io.pages?.[url];
      if (!rec) return { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
      if (Array.isArray(rec.attempts)) return rec.attempts[Math.min(attempt, rec.attempts.length - 1)];
      return rec;
    },
    async tlsCert(host) {
      const rec = io.tls?.[host];
      if (!rec) return notRecorded(`tls ${host}`);
      if (rec.error) return rec;
      // Stored relative to "now" so the fixtures never rot.
      return { ...rec, validTo: new Date(Date.now() + rec.daysFromNow * 86400000).toISOString() };
    },
    async nominatim() {
      return io.nominatim || { results: [] };
    },
    async search(query, { purpose = 'discover' } = {}) {
      return io.search?.[purpose] || { results: [] };
    },
  };
}
