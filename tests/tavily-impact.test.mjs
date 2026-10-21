// Tavily-backed claims (scripts/tavily-impact.mjs): which kept claims a Tavily result helped prove, how many were
// right, and which drops a Tavily-backed check decided. These tests keep the rule small and the published numbers
// tied to the script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load, roundTavily, tallyTavily, usesTavily } from '../scripts/tavily-impact.mjs';
import { load as loadAblation } from '../scripts/gate-ablation.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('own-site evidence counts as Tavily-backed unless the user typed the domain', () => {
  assert.equal(usesTavily({ check: 'site.own_site', params: { host: 'a.com', name: 'A' } }), true);
  assert.equal(usesTavily({ check: 'site.own_site', params: { host: 'a.com', userGiven: true } }), false);
  assert.equal(usesTavily({ check: 'site.own_site', params: {}, observed: { userGiven: true } }), false);
  assert.equal(usesTavily({ check: 'web.own_site_found' }), true);
  assert.equal(usesTavily({ check: 'web.no_closure_signal' }), true);
  assert.equal(usesTavily({ check: 'http.reachable' }), false);
  assert.equal(usesTavily(undefined), false);
});

test('a round splits kept claims by Tavily use and counts only drops a failed Tavily check decided', () => {
  const tav = { check: 'web.own_site_found', matched: true };
  const run = {
    results: [
      { id: 'a', verified: [{ type: 'no_own_website', evidence: [tav] }, { type: 'https_healthy', evidence: [{ check: 'tls.cert_valid' }] }],
        dropped: [{ type: 'site_online', evidence: [{ check: 'site.own_site', params: {}, matched: false }] }, { type: 'x', evidence: [{ check: 'http.reachable', matched: false }] }] },
      { id: 'b', verified: [{ type: 'site_online', evidence: [{ check: 'site.own_site', params: {} }] }],
        dropped: [{ type: 'y', evidence: [{ check: 'web.own_site_found', matched: null }] }] },
    ],
  };
  const verdicts = { verdicts: { a: { no_own_website: 'WRONG: has a site', https_healthy: 'right' }, b: { site_online: 'unverifiable' } } };
  const labels = [{ business: 'a', type: 'site_online', truth: 'false' }, { business: 'a', type: 'x', truth: 'true' }];
  const r = roundTavily(run, verdicts, labels);
  assert.deepEqual(r.tavily, { right: 0, wrong: 1, unsettled: 1 });
  assert.deepEqual(r.other, { right: 1, wrong: 0, unsettled: 0 });
  assert.deepEqual(r.noSite, { right: 0, wrong: 1, unsettled: 0 });
  assert.deepEqual(r.drops, { rightlyDropped: 1, wronglyDropped: 0, unknown: 0 }, 'an inconclusive check (matched: null) is not a failed one');
  const t = tallyTavily([{ round: 1, ...r }]);
  assert.equal(t.tavily.kept, 2);
  assert.equal(t.tavily.rightPct, 0);
  assert.equal(t.other.rightPct, 100);
});

test('Tavily-backed and other kept claims add up to the gate-ablation totals', () => {
  const a = load();
  const g = loadAblation();
  assert.equal(a.all.tavily.right + a.all.other.right, g.total.gate.right);
});

test('the published Tavily numbers are what the script computes', () => {
  const a = load();
  assert.deepEqual([a.early.tavily.right, a.early.tavily.right + a.early.tavily.wrong], [52, 77]);
  assert.deepEqual([a.lastFresh.tavily.right, a.lastFresh.tavily.right + a.lastFresh.tavily.wrong], [52, 56]);
  assert.deepEqual([a.all.tavily.right, a.all.tavily.wrong, a.all.other.wrong], [186, 46, 15]);
  assert.deepEqual([a.early.noSite.right, a.early.noSite.wrong, a.lastFresh.noSite.right, a.lastFresh.noSite.wrong], [9, 7, 10, 2]);
  assert.deepEqual(a.all.drops, { rightlyDropped: 28, wronglyDropped: 11, unknown: 6 });
  const md = read('docs/accuracy.md');
  assert.match(md, /\| Rounds 1–7 \(first three lists\) \| 52 of 77 \(67\.5%\) \|/);
  assert.match(md, /\| Last four fresh lists \(rounds 14, 16, 18, 19\) \| 52 of 56 \(92\.9%\) \|/);
  assert.match(md, /46 of the 61 wrong kept claims/);
  const readme = read('README.md');
  assert.match(readme, /67\.5% → 92\.9%/);
  assert.match(readme, /45 claims because a Tavily-backed check failed, 28 of them rightly/);
});
