// The "without the gate" numbers (scripts/gate-ablation.mjs) rest on two files: the results table in
// docs/accuracy.md and the label of every claim the gate dropped (eval/gate-ablation.json). These tests keep the
// labels tied to the run files they came from and the published totals tied to the script.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ablation, accuracyRows, load } from '../scripts/gate-ablation.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const labels = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'gate-ablation.json'), 'utf8'));

test('every claim a round dropped has one label, and only the three known labels', () => {
  assert.equal(labels.rounds.length, 19);
  for (const r of labels.rounds) {
    const run = JSON.parse(fs.readFileSync(path.join(root, r.run), 'utf8'));
    const dropped = run.results.flatMap((x) => (x.dropped || []).map((c) => `${x.id}/${c.type}`)).sort();
    assert.deepEqual(r.dropped.map((d) => `${d.business}/${d.type}`).sort(), dropped, `round ${r.round}`);
    for (const d of r.dropped) assert.ok(['false', 'true', 'unknown'].includes(d.truth), `round ${r.round} ${d.business}`);
  }
});

test('the accuracy table is read row by row, "N of M checkable" included', () => {
  const rows = accuracyRows(fs.readFileSync(path.join(root, 'docs', 'accuracy.md'), 'utf8'));
  assert.equal(rows.length, 19);
  assert.deepEqual(rows.find((r) => r.round === 4), { round: 4, proposed: 27, dropped: 1, kept: 26, right: 12, checkable: 23 });
  assert.deepEqual(rows.find((r) => r.round === 1), { round: 1, proposed: 40, dropped: 7, kept: 33, right: 24, checkable: 33 });
});

test('without the gate a reader sees every proposal: dropped wrong claims add errors, lost true claims add hits', () => {
  const rows = [{ round: 1, proposed: 10, dropped: 4, kept: 6, right: 5, checkable: 6 }];
  const lab = { rounds: [{ round: 1, dropped: [{ truth: 'false' }, { truth: 'false' }, { truth: 'true' }] }] };
  const a = ablation(rows, lab);
  assert.deepEqual(a.rounds[0].gate, { right: 5, wrong: 1, accuracy: 83.3 });
  assert.deepEqual(a.rounds[0].noGate, { right: 6, wrong: 3, accuracy: 66.7 });
  assert.deepEqual(a.rounds[0].dropped, { wrong: 2, right: 1, unknown: 1 }, 'a drop the file does not list is unsettled');
});

test('the published totals are what the script computes', () => {
  const { total } = load();
  assert.deepEqual([total.gate.right, total.gate.wrong, total.noGate.right, total.noGate.wrong], [435, 62, 446, 98]);
  assert.deepEqual(total.dropped, { wrong: 36, right: 11, unknown: 9 });
  const md = fs.readFileSync(path.join(root, 'docs', 'accuracy.md'), 'utf8');
  assert.match(md, /435 right and 62 wrong/);
  assert.match(md, /446 right and 98 wrong/);
});
