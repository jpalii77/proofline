// The frozen final round runs once, whole, from the list recorded on 20 Oct (eval/FROZEN.md). The accuracy run
// checks this before any search or model call, and the /proof page shows a result only when every kept claim
// has a hand verdict.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FINAL_LIST, finalResult, finalStartProblem, isFinalList, loadFinal, recordedHash, sha256 } from '../scripts/final-round.mjs';

const listBuf = fs.readFileSync(FINAL_LIST);
const recorded = recordedHash(fs.readFileSync(new URL('../eval/FROZEN.md', import.meta.url), 'utf8'));
const base = { listBuf, recorded, runs: ['2026-10-16-r19.json'], args: [], listLength: 12 };

test('the recorded list may start once, whole and with search on', () => {
  assert.equal(sha256(listBuf), recorded);
  assert.equal(finalStartProblem(base), null);
  assert.ok(isFinalList(FINAL_LIST));
  assert.ok(isFinalList(path.relative(process.cwd(), FINAL_LIST)));
  assert.equal(isFinalList(path.join(path.dirname(FINAL_LIST), 'businesses-9.json')), false);
});

test('a changed list, even by one space, does not run', () => {
  const changed = Buffer.concat([listBuf, Buffer.from(' ')]);
  assert.match(finalStartProblem({ ...base, listBuf: changed }), /SHA-256 mismatch/);
  assert.match(finalStartProblem({ ...base, recorded: null }), /no SHA-256/);
});

test('no partial or search-off final run', () => {
  for (const o of ['--only', '--round', '--no-tavily']) assert.match(finalStartProblem({ ...base, args: [o, '3'] }), new RegExp(o));
});

test('a finished final round never runs again, a stopped one only finishes with --resume', () => {
  const runs = [...base.runs, '2026-10-28-final.json'];
  assert.match(finalStartProblem({ ...base, runs, done: 12 }), /already ran/);
  assert.match(finalStartProblem({ ...base, runs, done: 12, args: ['--resume'] }), /already ran/);
  assert.match(finalStartProblem({ ...base, runs, done: 5 }), /5 of 12 done.*--resume/);
  assert.equal(finalStartProblem({ ...base, runs, done: 5, args: ['--resume'] }), null);
  assert.match(finalStartProblem({ ...base, args: ['--resume'] }), /Nothing to resume/);
  assert.match(finalStartProblem({ ...base, runs: [...runs, '2026-10-29-final.json'] }), /more than one/i);
});

const run = {
  day: '2026-10-28',
  results: [
    { id: 'a', verified: [{ type: 'site_online' }, { type: 'https_healthy' }], dropped: [{ type: 'no_site' }] },
    { id: 'b', verified: [{ type: 'not_on_map' }], dropped: [], error: null },
    { id: 'c', verified: [], dropped: [], error: 'timeout' },
  ],
};

test('the result counts right, wrong and unsettled like every other round', () => {
  const verdicts = { verdicts: { a: { site_online: 'right', https_healthy: 'wrong: expired 3 Oct' }, b: { not_on_map: 'unverifiable (two shops of this name)' } } };
  assert.deepEqual(finalResult(run, verdicts), { day: '2026-10-28', businesses: 3, errors: 1, kept: 3, dropped: 1, right: 1, wrong: 1, unsettled: 1, checkable: 2 });
});

test('a half-checked final round shows no result', () => {
  assert.equal(finalResult(run, { verdicts: { a: { site_online: 'right', https_healthy: 'right' } } }), null);
  assert.equal(finalResult(run, { verdicts: { a: { site_online: 'right', https_healthy: ' ' }, b: { not_on_map: 'right' } } }), null);
  assert.equal(finalResult(null, { verdicts: {} }), null);
});

test('loadFinal reads the final run and its verdicts, and nothing before both exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'final-'));
  fs.mkdirSync(path.join(dir, 'runs'));
  assert.equal(loadFinal(dir), null);
  fs.writeFileSync(path.join(dir, 'runs', '2026-10-28-final.json'), JSON.stringify(run));
  assert.equal(loadFinal(dir), null);
  fs.writeFileSync(path.join(dir, 'verdicts-final.json'), JSON.stringify({ verdicts: { a: { site_online: 'right', https_healthy: 'right' }, b: { not_on_map: 'right' } } }));
  const r = loadFinal(dir);
  assert.equal(r.right, 3);
  assert.equal(r.run, 'eval/runs/2026-10-28-final.json');
  assert.equal(r.verdicts, 'eval/verdicts-final.json');
  fs.rmSync(dir, { recursive: true });
});

test('the final round ran once (27 Oct) from the recorded list, and every kept claim has a hand verdict', () => {
  const r = loadFinal();
  assert.ok(r, 'final run and verdicts-final.json are both in the repository');
  assert.equal(r.run, 'eval/runs/2026-10-27-final.json');
  const run = JSON.parse(fs.readFileSync(new URL(`../${r.run}`, import.meta.url), 'utf8'));
  assert.equal(run.frozen.sha256, recorded);
  assert.deepEqual({ businesses: r.businesses, errors: r.errors, kept: r.kept, dropped: r.dropped, right: r.right, wrong: r.wrong, unsettled: r.unsettled }, { businesses: 12, errors: 0, kept: 33, dropped: 1, right: 33, wrong: 0, unsettled: 0 });
  // a second start is refused
  assert.match(finalStartProblem({ ...base, runs: ['2026-10-27-final.json'], done: 12 }), /already ran/);
  // accuracy.md states the same numbers
  assert.match(fs.readFileSync(new URL('../docs/accuracy.md', import.meta.url), 'utf8'), /\| 12 \| 34 \| 1 \| 33 \| 33 of 33 \| \*\*100%\*\* \|/);
});
