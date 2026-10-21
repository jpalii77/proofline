// Report-level numbers (scripts/report-impact.mjs): how many business reports carried at least one wrong claim,
// with and without the gate. These tests keep the verdict marks tied to each round's published counts and the
// published numbers tied to the script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load, mark, roundReports, tally } from '../scripts/report-impact.mjs';
import { accuracyRows } from '../scripts/gate-ablation.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('a verdict note is read by its first word, in either case; anything else is unsettled', () => {
  assert.equal(mark('right (ends 9 Jan 2027)'), 'right');
  assert.equal(mark('WRONG: its Bostanlı store is on the map'), 'wrong');
  assert.equal(mark('wrong: same site'), 'wrong');
  assert.equal(mark('unverifiable: the brand has two sites'), 'unsettled');
  assert.equal(mark('rightly dropped'), 'unsettled', 'a word that only starts with "right" is not a mark');
  assert.equal(mark(undefined), 'unsettled');
});

test('a report is wrong with the gate if it shows a wrong claim, and without the gate also if the gate removed one', () => {
  const run = { results: [{ id: 'a', verified: [{ type: 'site_online' }] }, { id: 'b', verified: [{ type: 'site_online' }, { type: 'not_on_map' }] }, { id: 'c', verified: [] }] };
  const verdicts = { verdicts: { a: { site_online: 'right' }, b: { site_online: 'right', not_on_map: 'WRONG: listed' }, c: {} } };
  const dropped = [{ business: 'a', type: 'no_own_website', truth: 'false' }, { business: 'c', type: 'x', truth: 'true' }, { business: 'c', type: 'y', truth: 'unknown' }];
  const reports = roundReports(run, verdicts, dropped);
  assert.deepEqual(reports.map((p) => [p.business, p.withGate, p.withoutGate]), [['a', 'clean', 'wrong'], ['b', 'wrong', 'wrong'], ['c', 'clean', 'clean']]);
  const t = tally([{ round: 1, reports }]);
  assert.deepEqual([t.reports, t.withGate, t.withoutGate, t.cleanWithGate], [3, 1, 2, 66.7]);
});

test('the marks reproduce every round\'s right and wrong counts in docs/accuracy.md (round 1: one claim short)', () => {
  const rows = accuracyRows(read('docs/accuracy.md'));
  const labels = JSON.parse(read('eval/gate-ablation.json'));
  for (const r of labels.rounds) {
    const run = JSON.parse(read(r.run));
    const v = JSON.parse(read(r.verdicts));
    const marks = run.results.flatMap((x) => (x.verified || []).map((c) => mark((v.verdicts[x.id] || {})[c.type])));
    const row = rows.find((x) => x.round === r.round);
    const right = marks.filter((m) => m === 'right').length;
    const wrong = marks.filter((m) => m === 'wrong').length;
    assert.equal(right, row.right, `round ${r.round} right`);
    // round 1's table counts 33 kept / 9 wrong; its run file holds 32 of those claims, 8 of them wrong
    assert.equal(wrong, row.checkable - row.right - (r.round === 1 ? 1 : 0), `round ${r.round} wrong`);
  }
});

test('the published report-level numbers are what the script computes', () => {
  const a = load();
  assert.equal(a.all.reports, 228);
  assert.deepEqual([a.firstFresh.withGate, a.firstFresh.withoutGate], [6, 9]);
  assert.deepEqual([a.fresh.reports, a.fresh.withGate, a.fresh.withoutGate], [108, 24, 31]);
  assert.deepEqual([a.lastFresh.reports, a.lastFresh.withGate, a.lastFresh.withoutGate], [48, 4, 5]);
  assert.deepEqual([a.all.withGate, a.all.withoutGate], [36, 56]);
  const md = read('docs/accuracy.md');
  assert.match(md, /6 of the 12 reports/);
  assert.match(md, /4 of 48 reports/);
  assert.match(md, /36 of 228 reports/);
  assert.match(md, /56 of 228/);
});
