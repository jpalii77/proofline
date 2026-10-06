// The gate animation's choreography (public/gate.js), checked without a browser: every card goes
// where its real verdict says, and the next card never moves while the one before still holds the
// track, so cards never overlap in flight.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEAD, layoutFor, planFor, sample } from '../public/gate.js';
import { lanesFromReport } from '../public/gate-data.js';
import { loadSamples } from '../src/io/sample.mjs';
import { createWebApp } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';

async function reportFor(input) {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  const res = await app(new Request(`https://demo.test/api/run?q=${encodeURIComponent(input)}`, { headers: { 'cf-connecting-ip': '203.0.113.9' } }));
  const text = await res.text();
  const done = text.split('\n\n').find((b) => /^event: done$/m.test(b));
  return JSON.parse(/^data: (.*)$/m.exec(done)[1]).report;
}

const LAYOUTS = [
  ['landing, wide', 553, 360, 'loop'],
  ['run, wide', 755, 300, 'run'],
  ['phone', 334, 372, 'run'],
];

for (const sample0 of loadSamples()) {
  test(`gate motion follows the verdicts: ${sample0.id}`, async () => {
    const lanes = lanesFromReport(await reportFor(sample0.input));
    assert.ok(lanes.length > 0);
    for (const [name, W, H, mode] of LAYOUTS) {
      const rows = { kept: lanes.filter((l) => l.verdict === 'verified').length, dropped: lanes.filter((l) => l.verdict === 'dropped').length };
      const L = layoutFor(W, H, rows, mode);
      const plans = lanes.map((l) => planFor(l, L));
      const last = L.gates[L.gates.length - 1];
      lanes.forEach((lane, i) => {
        const p = plans[i];
        const end = sample(p, p.end);
        assert.ok(p.leave <= p.end && p.reserve <= p.end, `${name}: timing marks inside the path`);
        if (lane.verdict === 'verified') {
          // it ends on top of the verified list, past every post
          assert.deepEqual([Math.round(end.x), Math.round(end.y)], [Math.round(L.kept(0).x), Math.round(L.kept(0).y)], `${name}: kept card lands in the verified list`);
          assert.ok(p.marks.some((m) => m.state === 'kept'));
        } else {
          // it never crosses the post that failed it, and ends on top of the dropped list
          const g = L.gates[lane.dropAt];
          for (let u = 0; u <= p.leave; u += 20) {
            const q = sample(p, u);
            assert.ok(q.x + L.cardW <= g.x - g.w / 2 + 0.5, `${name}: dropped card stops before its post ${lane.dropAt}`);
          }
          assert.deepEqual([Math.round(end.x), Math.round(end.y)], [Math.round(L.dropped(0).x), Math.round(L.dropped(0).y)], `${name}: dropped card lands in the dropped list`);
          assert.ok(p.marks.some((m) => m.state === 'dropped'));
          assert.ok(!p.marks.some((m) => m.state === 'kept'));
        }
        void last;
      });
      // the next card never touches the card ahead: it only leaves the queue stack once that card
      // is off the track (passed every post, or fallen below the track)
      for (let i = 1; i < lanes.length; i++) {
        const a = plans[i - 1];
        const gap = Math.max(a.leave - LEAD, 380);
        const home = sample(plans[i], 0);
        for (let u = gap; u <= a.end; u += 20) {
          const pa = sample(a, u);
          const pb = sample(plans[i], u - gap);
          const stirred = Math.hypot(pb.x - home.x, pb.y - home.y);
          const touch = Math.abs(pa.x - pb.x) < L.cardW && Math.abs(pa.y - pb.y) < L.cardH;
          assert.ok(stirred < 24 || !touch, `${name}: card ${i} touches card ${i - 1} at ${u} ms`);
        }
      }
    }
  });
}
