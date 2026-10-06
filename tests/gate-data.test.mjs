// The gate animation must show exactly what the gate decided: every lane kept or dropped as in the
// final report, with the report's drop reason, stopping at the gate line that holds the failed check.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GATES, gateOf, gateSummary, laneFromGate, lanesFromEvents, lanesFromReport, MINI, SHORT } from '../public/gate-data.js';
import { CHECKS } from '../src/checks.mjs';
import { CLAIM_TYPES } from '../src/claims.mjs';
import { loadSamples } from '../src/io/sample.mjs';
import { createWebApp } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';

async function runSample(input) {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  const res = await app(new Request(`https://demo.test/api/run?q=${encodeURIComponent(input)}`, { headers: { 'cf-connecting-ip': '203.0.113.9' } }));
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map((b) => ({ type: /^event: (.*)$/m.exec(b)?.[1], ...JSON.parse(/^data: (.*)$/m.exec(b)?.[1] || '{}') }));
}

test('every check and every claim type has a place in the gate visual', () => {
  const all = GATES.flatMap((g) => g.checks);
  assert.equal(new Set(all).size, all.length, 'a check sits in one gate only');
  for (const id of Object.keys(CHECKS)) assert.ok(all.includes(id), `check ${id} has a gate line`);
  for (const t of Object.keys(CLAIM_TYPES)) {
    assert.ok(SHORT[t], `claim type ${t} has a short card label`);
    assert.ok(!/\d/.test(SHORT[t]), `short label for ${t} carries no number`);
    assert.ok(MINI[t], `claim type ${t} has a narrow-screen label`);
    assert.ok(MINI[t].length <= 18, `narrow label for ${t} fits a phone card without truncation`);
    // no single word wider than a phone card's text line (about 90 px: 11 characters at 12 px)
    assert.ok(MINI[t].split(' ').every((w) => w.length <= 11), `narrow label for ${t} wraps cleanly`);
  }
});

for (const sample of loadSamples()) {
  test(`gate lanes match the report: ${sample.id}`, async () => {
    const events = await runSample(sample.input);
    const report = events.find((e) => e.type === 'done').report;
    const lanes = lanesFromEvents(events);

    assert.deepEqual(lanes.filter((l) => l.verdict === 'verified').map((l) => l.id).sort(), report.verified.map((c) => c.id).sort());
    assert.deepEqual(lanes.filter((l) => l.verdict === 'dropped').map((l) => l.id).sort(), report.dropped.map((c) => c.id).sort());
    assert.deepEqual(gateSummary(lanes), { proposed: report.stats.proposed, kept: report.stats.verified, dropped: report.stats.dropped });

    // every proposed claim gets exactly one lane
    const proposed = events.find((e) => e.type === 'propose').claims.map((c) => c.id).sort();
    assert.deepEqual(lanes.map((l) => l.id).sort(), proposed);

    for (const l of lanes) {
      const c = [...report.verified, ...report.dropped].find((x) => x.id === l.id);
      assert.equal(l.statement, c.statement);
      if (l.verdict === 'verified') {
        assert.equal(l.dropAt, null);
        assert.equal(l.reason, null);
        assert.ok(c.evidence.every((e) => e.matched && !e.skipped), 'a kept lane has only matching checks');
      } else {
        assert.equal(l.reason, c.dropReason, 'the stamp shows the report’s own reason');
        assert.ok(l.failed, 'a dropped lane names the check that failed');
        assert.equal(l.dropAt, gateOf(l.failed.check));
        const bad = c.evidence.filter((e) => !e.matched || e.skipped);
        assert.ok(bad.some((e) => e.check === l.failed.check), 'the failed check is one that really failed');
        assert.equal(l.dropAt, Math.min(...bad.map((e) => gateOf(e.check))), 'it stops at the first gate line that fails it');
      }
      assert.ok(l.touches.every((g) => g >= 0 && g < GATES.length));
    }

    // shared links rebuild the same lanes from the report alone
    const fromReport = lanesFromReport(report);
    const key = (ls) => ls.map((l) => [l.id, l.verdict, l.dropAt, l.reason]).sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(key(fromReport), key(lanes));
  });
}

test('an inconclusive check drops the claim at its own gate line', () => {
  const lane = laneFromGate({ id: 'x', claimType: 'on_map', verdict: 'dropped', statement: 's', dropReason: 'not checked', evidence: [{ check: 'osm.listed', matched: false, skipped: true }] });
  assert.equal(lane.verdict, 'dropped');
  assert.equal(lane.dropAt, gateOf('osm.listed'));
  assert.equal(lane.reason, 'not checked');
});

test('the verdict comes from the event, never from the evidence alone', () => {
  // even if every check matched, a "dropped" verdict stays dropped (and vice versa)
  const d = laneFromGate({ id: 'a', claimType: 'site_online', verdict: 'dropped', statement: 's', dropReason: 'r', evidence: [{ check: 'http.reachable', matched: true }] });
  assert.equal(d.verdict, 'dropped');
  const k = laneFromGate({ id: 'b', claimType: 'site_online', verdict: 'verified', statement: 's', evidence: [] });
  assert.equal(k.verdict, 'verified');
  assert.equal(k.label, SHORT.site_online);
});
