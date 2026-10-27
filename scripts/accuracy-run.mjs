// Accuracy run: the live agent on a list of real businesses, one after another, saved for later human review.
//   NEBIUS_API_KEY=... TAVILY_API_KEY=... npm run accuracy -- [eval/businesses.json] [--only 3] [--no-tavily]
// --no-tavily: the same agent with web search turned off (a comparison run; writes runs/<date>-notavily.json).
// eval/businesses-10.json is the frozen final round: it runs once and whole (runs/<date>-final.json), only if its
// hash matches eval/FROZEN.md; --resume finishes a final run that stopped (see scripts/final-round.mjs).
// Writes eval/runs/<date>.json: for every business the claims the gate kept and dropped (with evidence and reason),
// the cited findings, model calls (tokens, latency) and timing. Nothing is judged here; a person (or a second,
// independent check) marks each kept claim right or wrong in eval/verdicts.json, then `npm run accuracy:table`.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../src/agent/pipeline.mjs';
import { FINAL_RUN, finalStartProblem, isFinalList, recordedHash } from './final-round.mjs';
import { withoutSearch } from '../src/baseline.mjs';
import { configProblem, readConfig, wiringFor } from '../src/runtime.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt > -1 ? Number(args[onlyAt + 1]) : Infinity;
// --round 2 writes runs/<date>-r2.json, so a second round on the same day never overwrites the first.
const roundAt = args.indexOf('--round');
const round = roundAt > -1 ? String(args[roundAt + 1] || '').replace(/[^0-9a-z]/gi, '') : '';
const noTavily = args.includes('--no-tavily');
const listPath =args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only' && args[i - 1] !== '--round') || join(root, 'eval', 'businesses.json');

const cfg = readConfig();
if (cfg.sampleMode) { console.error('Accuracy runs need live mode (unset SAMPLE_MODE).'); process.exit(1); }
const problem = configProblem(cfg);
if (problem) { console.error(problem); process.exit(1); }

const outDir = join(root, 'eval', 'runs');
mkdirSync(outDir, { recursive: true });
// The frozen final round (eval/FROZEN.md) runs once, whole, from the recorded list: checked before any call.
const listBuf = readFileSync(listPath);
let day = new Date().toISOString().slice(0, 10);
let outPath = join(outDir, `${day}${round ? `-r${round}` : ''}${noTavily ? '-notavily' : ''}.json`);
const results = [];
let frozen = null;
if (isFinalList(listPath)) {
  const runs = readdirSync(outDir);
  const startedFile = runs.find((f) => FINAL_RUN.test(f));
  const prev = startedFile ? JSON.parse(readFileSync(join(outDir, startedFile), 'utf8')) : null;
  frozen = recordedHash(readFileSync(join(root, 'eval', 'FROZEN.md'), 'utf8'));
  const problem = finalStartProblem({ listBuf, recorded: frozen, runs, args, listLength: JSON.parse(listBuf.toString('utf8')).length, done: prev ? prev.results.length : 0 });
  if (problem) { console.error(problem); process.exit(1); }
  if (prev) { day = prev.day; results.push(...prev.results); }
  outPath = join(outDir, startedFile || `${day}-final.json`);
}
const list = JSON.parse(listBuf.toString('utf8')).slice(0, only);
const save = () => writeFileSync(outPath, JSON.stringify({ day, ...(frozen ? { frozen: { sha256: frozen } } : {}), ...(noTavily ? { tavily: 'off' } : {}), models: { reasoning: cfg.nebius.reasoningModel, fast: cfg.nebius.fastModel || null }, results }, null, 2) + '\n');

for (const [i, item] of list.entries()) {
  const query = typeof item === 'string' ? item : item.query;
  if (results.some((x) => x.id === (item.id || `b${i + 1}`))) continue; // --resume: already done, kept as it was
  process.stdout.write(`[${i + 1}/${list.length}] ${query} … `);
  const w = wiringFor(cfg, query);
  const started = Date.now();
  const models = [];
  let res;
  try {
    res = await runAgent({ query: w.query, io: noTavily ? withoutSearch(w.io) : w.io, brain: w.brain, emit: (e) => { if (e.type === 'model') models.push({ role: e.role, model: e.model, ms: e.ms, usage: e.usage || null, outcome: e.outcome, format: e.format || null }); } });
  } catch (e) {
    res = { error: String(e && e.message ? e.message : e) };
  }
  const r = res.report;
  results.push({
    id: item.id || `b${i + 1}`,
    query,
    note: item.note || null,
    ms: Date.now() - started,
    error: res.error || null,
    grade: r ? r.card.grade : null,
    stats: r ? r.stats : null,
    verified: r ? r.verified : [],
    dropped: r ? r.dropped : [],
    rejected: r ? r.rejected : [],
    findings: r && r.pitch ? r.pitch.findings : [],
    models,
  });
  save();
  console.log(res.error ? `error: ${res.error}` : `${r.stats.verified} kept, ${r.stats.dropped} dropped (${Math.round((Date.now() - started) / 1000)} s)`);
  await new Promise((ok) => setTimeout(ok, 4000)); // be gentle with the APIs between businesses
}
console.log(`\nSaved ${outPath}`);
