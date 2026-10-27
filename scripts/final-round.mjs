// The frozen final round (eval/FROZEN.md) runs once. These checks keep that promise in code, not only in
// prose: the accuracy run refuses the frozen list if its hash differs from the recorded one, if it already ran,
// or with an option that would run only part of it. A run that stopped half-way can be finished with --resume
// (the businesses already done are kept as they are, never run again). Once every kept claim has a hand
// verdict in eval/verdicts-final.json, the /proof page shows the result (scripts/proof-data.mjs).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mark } from './report-impact.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FINAL_LIST = path.join(root, 'eval', 'businesses-10.json');
export const FINAL_RUN = /^\d{4}-\d{2}-\d{2}-final\.json$/;

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The SHA-256 written in FROZEN.md before the run. */
export function recordedHash(frozenMd) {
  const m = /SHA-256:\s*([0-9a-f]{64})/.exec(frozenMd);
  return m ? m[1] : null;
}

export const isFinalList = (listPath) => path.resolve(listPath) === FINAL_LIST;

/**
 * Why the frozen list must not run now, or null when it may.
 * listBuf: the list file's bytes; recorded: the hash in FROZEN.md; runs: file names in eval/runs;
 * args: the command-line options; done: how many businesses the existing final run file holds (if any).
 */
export function finalStartProblem({ listBuf, recorded, runs, args, listLength, done = 0 }) {
  if (!recorded) return 'eval/FROZEN.md has no SHA-256 line; the final round cannot be checked.';
  if (sha256(listBuf) !== recorded) return 'The final list differs from the one recorded in eval/FROZEN.md (SHA-256 mismatch). It runs only as recorded.';
  const partial = ['--only', '--round', '--no-tavily'].filter((o) => args.includes(o));
  if (partial.length) return `The final round runs whole and as the live demo runs it; remove ${partial.join(', ')}.`;
  const existing = runs.filter((f) => FINAL_RUN.test(f));
  if (existing.length > 1) return `More than one final run file (${existing.join(', ')}); the final round runs once.`;
  if (existing.length && !args.includes('--resume')) {
    return done < listLength
      ? `The final round already started (${existing[0]}, ${done} of ${listLength} done). Finish it with --resume.`
      : `The final round already ran (${existing[0]}). It runs once.`;
  }
  if (existing.length && done >= listLength) return `The final round already ran (${existing[0]}). It runs once.`;
  if (!existing.length && args.includes('--resume')) return 'Nothing to resume: the final round has not started.';
  return null;
}

/** The final round's numbers, or null until every kept claim has a verdict (a half-checked run is not shown). */
export function finalResult(run, verdicts) {
  if (!run || !verdicts) return null;
  const kept = run.results.flatMap((x) => (x.verified || []).map((c) => mark((verdicts.verdicts[x.id] || {})[c.type])));
  const notes = run.results.flatMap((x) => (x.verified || []).map((c) => (verdicts.verdicts[x.id] || {})[c.type]));
  if (notes.some((n) => typeof n !== 'string' || !n.trim())) return null;
  const right = kept.filter((m) => m === 'right').length;
  const wrong = kept.filter((m) => m === 'wrong').length;
  return {
    day: run.day,
    businesses: run.results.length,
    errors: run.results.filter((x) => x.error).length,
    kept: kept.length,
    dropped: run.results.reduce((n, x) => n + (x.dropped || []).length, 0),
    right,
    wrong,
    unsettled: kept.length - right - wrong,
    checkable: right + wrong,
  };
}

/** The final run file and its verdicts from the repository, if both exist; the run file name for links. */
export function loadFinal(dir = path.join(root, 'eval')) {
  const runsDir = path.join(dir, 'runs');
  const runFile = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).filter((f) => FINAL_RUN.test(f)).sort()[0] : null;
  const verdictFile = path.join(dir, 'verdicts-final.json');
  if (!runFile || !fs.existsSync(verdictFile)) return null;
  const run = JSON.parse(fs.readFileSync(path.join(runsDir, runFile), 'utf8'));
  const result = finalResult(run, JSON.parse(fs.readFileSync(verdictFile, 'utf8')));
  return result && { ...result, run: `eval/runs/${runFile}`, verdicts: 'eval/verdicts-final.json' };
}
