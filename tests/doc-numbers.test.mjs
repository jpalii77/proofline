// The test count in README, the Devpost text and the judge sheet must not go stale (it said 374 while 384 ran).
// The full count needs a suite run (scripts/doc-numbers.mjs); these checks are the cheap part of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PLACES, statedNumbers, withNumbers, tapTotal, countTestFiles, staleNumbers } from '../scripts/doc-numbers.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const texts = Object.fromEntries(PLACES.map(({ file }) => [file, read(file)]));
const [readme] = PLACES;

test('both texts still carry the test-count sentence', () => {
  for (const { file, re } of PLACES) assert.ok(statedNumbers(texts[file], re), file);
});

test('README, the Devpost text and the judge sheet state the same test count', () => {
  const counts = PLACES.map(({ file, re }) => statedNumbers(texts[file], re).tests);
  assert.equal(new Set(counts).size, 1, counts.join(' / '));
});

test('README states the real number of test files', () => {
  assert.equal(statedNumbers(texts[readme.file], readme.re).files, countTestFiles());
});

test('the TAP summary total is read; a run without one gives null', () => {
  assert.equal(tapTotal('ok 1 - a\n# tests 384\n# suites 0\n# pass 384\n'), 384);
  assert.equal(tapTotal('not ok 1 - crashed\n'), null);
  assert.equal(tapTotal(undefined), null);
});

test('stale numbers are named, and --fix writes the real ones without touching the rest', () => {
  const old = { 'README.md': 'x **374 tests in 53 files, all passing** y', 'docs/devpost-v2.md': '- **Tests:** 374 `node:test` tests, z', 'docs/gallery/judge-sheet.html': '<span data-k="tests">374 tests, no network</span>' };
  const real = { tests: 384, files: 55 };
  assert.deepEqual(staleNumbers(old, real).map((s) => `${s.file}:${s.what}`), ['README.md:tests', 'README.md:files', 'docs/devpost-v2.md:tests', 'docs/gallery/judge-sheet.html:tests']);
  const fixed = Object.fromEntries(PLACES.map(({ file, re }) => [file, withNumbers(old[file], re, real)]));
  assert.equal(fixed['README.md'], 'x **384 tests in 55 files, all passing** y');
  assert.equal(fixed['docs/devpost-v2.md'], '- **Tests:** 384 `node:test` tests, z');
  assert.equal(fixed['docs/gallery/judge-sheet.html'], '<span data-k="tests">384 tests, no network</span>');
  assert.deepEqual(staleNumbers(fixed, real), []);
});

test('a missing sentence counts as stale instead of passing silently', () => {
  const s = staleNumbers({ 'README.md': 'rewritten', 'docs/devpost-v2.md': '- **Tests:** 9 `node:test` tests', 'docs/gallery/judge-sheet.html': 'data-k="tests">9 tests' }, { tests: 9, files: 1 });
  assert.deepEqual(s.map((x) => `${x.file}:${x.what}`), ['README.md:sentence']);
});
