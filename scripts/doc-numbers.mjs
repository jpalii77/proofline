// README and the Devpost text say how many tests there are. That number went stale once (374 in the text
// while 384 ran), so this runs the suite, counts the tests and test files, and compares. No network, no keys.
//   node scripts/doc-numbers.mjs          -> exits 1 and names each stale number
//   node scripts/doc-numbers.mjs --fix    -> writes the real numbers into the texts
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Each text that states the test count, and the sentence it uses. Group 1 = tests, group 2 = files (if stated). */
export const PLACES = [
  { file: 'README.md', re: /\*\*(\d+) tests in (\d+) files, all passing\*\*/ },
  { file: 'docs/devpost-v2.md', re: /\*\*Tests:\*\* (\d+) `node:test` tests/ },
  { file: 'docs/gallery/judge-sheet.html', re: /data-k="tests">(\d+) tests/ },
];

/** Numbers a text states: { tests, files } (files is null when the sentence does not give it), or null if absent. */
export function statedNumbers(text, re) {
  const m = re.exec(typeof text === 'string' ? text : '');
  if (!m) return null;
  return { tests: Number(m[1]), files: m[2] === undefined ? null : Number(m[2]) };
}

/** The same text with the real numbers written in; unchanged when the sentence is absent. */
export function withNumbers(text, re, real) {
  return text.replace(re, (all, tests, files) => {
    let out = all.replace(tests, String(real.tests));
    if (files !== undefined) out = out.replace(new RegExp(`\\b${files} files`), `${real.files} files`);
    return out;
  });
}

/** Total from node:test's TAP summary ("# tests 384"), or null if the run printed none. */
export function tapTotal(tap) {
  const m = /^# tests (\d+)$/m.exec(typeof tap === 'string' ? tap : '');
  return m ? Number(m[1]) : null;
}

/** Test files the runner picks up from tests/. */
export function countTestFiles(dir = path.join(root, 'tests')) {
  return fs.readdirSync(dir).filter((f) => /\.test\.m?js$/.test(f)).length;
}

/** Every stale number: [{ file, what, stated, real }]; a missing sentence counts as stale. */
export function staleNumbers(texts, real) {
  const out = [];
  for (const { file, re } of PLACES) {
    const s = statedNumbers(texts[file], re);
    if (!s) { out.push({ file, what: 'sentence', stated: null, real: null }); continue; }
    if (s.tests !== real.tests) out.push({ file, what: 'tests', stated: s.tests, real: real.tests });
    if (s.files !== null && s.files !== real.files) out.push({ file, what: 'files', stated: s.files, real: real.files });
  }
  return out;
}

function main() {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  const tests = tapTotal(run.stdout);
  if (tests === null) {
    console.error('The test run printed no total; run npm test to see why.');
    process.exit(1);
  }
  // A failing suite still has a count (tests/doc-numbers.test.mjs itself fails while the numbers are stale).
  if (run.status !== 0) console.error('Note: some tests fail; the count below includes them (npm test).');
  const real = { tests, files: countTestFiles() };
  const texts = Object.fromEntries(PLACES.map(({ file }) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
  const stale = staleNumbers(texts, real);
  if (!stale.length) { console.log(`Up to date: ${real.tests} tests in ${real.files} files.`); return; }
  if (process.argv.includes('--fix')) {
    for (const { file, re } of PLACES) fs.writeFileSync(path.join(root, file), withNumbers(texts[file], re, real));
    console.log(`Written: ${real.tests} tests in ${real.files} files.`);
    return;
  }
  for (const s of stale) console.error(s.what === 'sentence' ? `${s.file}: test-count sentence not found` : `${s.file}: says ${s.stated} ${s.what}, real ${s.real}`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
