// The measurement page (/proof) must say what docs/accuracy.md and the verdict files say: its data file is
// generated from them (scripts/proof-data.mjs) and checked here, so a new round or a changed verdict that is
// not carried to the page fails the suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ACCURACY } from '../public/accuracy.js';
import { PROOF } from '../public/proof-data.js';
import { loadFinal } from '../scripts/final-round.mjs';
import { build, finalForPage, OUT, render, searchRows } from '../scripts/proof-data.mjs';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const html = read('public/proof.html');

test('public/proof-data.js is up to date with accuracy.md and the run and verdict files', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), render(build()), 'run: node scripts/proof-data.mjs --write');
});

test('the claims listed add up to the landing page number: 109 of 114 checkable right', () => {
  const kept = PROOF.lists.flatMap((l) => l.businesses.flatMap((b) => b.kept));
  const checkable = kept.filter((c) => c.mark !== 'unsettled');
  assert.deepEqual(PROOF.lists.map((l) => l.round), ACCURACY.rounds);
  assert.equal(checkable.length, ACCURACY.total);
  assert.equal(checkable.filter((c) => c.mark === 'right').length, ACCURACY.kept);
  // every wrong claim shows the hand check's reason
  for (const c of kept.filter((k) => k.mark === 'wrong')) assert.match(c.note, /^wrong/i);
});

test('each round on the page matches its row in accuracy.md, and so do the gate and search numbers', () => {
  const md = read('docs/accuracy.md');
  for (const l of PROOF.lists) {
    const row = PROOF.rounds.find((r) => r.round === l.round);
    const kept = l.businesses.flatMap((b) => b.kept).filter((c) => c.mark !== 'unsettled');
    assert.equal(kept.length, row.checkable, `round ${l.round}`);
    assert.equal(kept.filter((c) => c.mark === 'right').length, row.right, `round ${l.round}`);
  }
  assert.equal(PROOF.rounds.length, 19);
  assert.deepEqual(PROOF.gate, { right: 435, wrong: 62, noGateRight: 446, noGateWrong: 98, removed: 36, lost: 11 });
  assert.match(md, /with the gate a reader saw \*\*435 right and 62 wrong\*\*/);
  assert.deepEqual(PROOF.reports.lastFresh, { reports: 48, withGate: 4, withoutGate: 5 });
  assert.deepEqual(searchRows(md).map((r) => [r.right, r.checkable, r.sitesFound]), [[27, 30, 8], [14, 15, 2], [0, 0, 2]]);
});

test('the frozen final round is named with its hash, and its result comes only from the checked run', () => {
  assert.ok(read('eval/FROZEN.md').includes(PROOF.frozen.sha256));
  assert.deepEqual(PROOF.frozen.result, finalForPage(loadFinal()));
  if (PROOF.frozen.result) assert.match(PROOF.frozen.result.run, /eval\/runs\/\d{4}-\d{2}-\d{2}-final\.json$/);
});

test('/proof is served locally as on Workers, and the page keeps to the CSP and the type rules', () => {
  assert.match(read('server.mjs'), /pathname === '\/proof' \? 'proof\.html'/);
  assert.match(html, /<script type="module" src="\/proof\.js"><\/script>/);
  assert.ok(!/<script(?![^>]*src=)/.test(html), 'no inline script (the CSP blocks it)');
  assert.ok(!/style=/.test(html), 'no inline style (the CSP blocks it)');
  assert.ok(!/Geist|monospace|Fraunces/.test(html + read('public/proof.css')));
  // app.css already has .proof (the evidence drawer); reusing it styled the page's claim rows
  assert.ok(!/class="proof"/.test(html));
});
