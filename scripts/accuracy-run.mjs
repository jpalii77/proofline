// Accuracy run: the live agent on a list of real businesses, one after another, saved for later human review.
//   NEBIUS_API_KEY=... TAVILY_API_KEY=... npm run accuracy -- [eval/businesses.json] [--only 3]
// Writes eval/runs/<date>.json: for every business the claims the gate kept and dropped (with evidence and reason),
// the cited findings, model calls (tokens, latency) and timing. Nothing is judged here; a person (or a second,
// independent check) marks each kept claim right or wrong in eval/verdicts.json, then `npm run accuracy:table`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../src/agent/pipeline.mjs';
import { configProblem, readConfig, wiringFor } from '../src/runtime.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt > -1 ? Number(args[onlyAt + 1]) : Infinity;
const listPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only') || join(root, 'eval', 'businesses.json');

const cfg = readConfig();
if (cfg.sampleMode) { console.error('Accuracy runs need live mode (unset SAMPLE_MODE).'); process.exit(1); }
const problem = configProblem(cfg);
if (problem) { console.error(problem); process.exit(1); }

const list = JSON.parse(readFileSync(listPath, 'utf8')).slice(0, only);
const day = new Date().toISOString().slice(0, 10);
const outDir = join(root, 'eval', 'runs');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${day}.json`);
const results = [];
const save = () => writeFileSync(outPath, JSON.stringify({ day, models: { reasoning: cfg.nebius.reasoningModel, fast: cfg.nebius.fastModel || null }, results }, null, 2) + '\n');

for (const [i, item] of list.entries()) {
  const query = typeof item === 'string' ? item : item.query;
  process.stdout.write(`[${i + 1}/${list.length}] ${query} … `);
  const w = wiringFor(cfg, query);
  const started = Date.now();
  const models = [];
  let res;
  try {
    res = await runAgent({ query: w.query, io: w.io, brain: w.brain, emit: (e) => { if (e.type === 'model') models.push({ role: e.role, model: e.model, ms: e.ms, usage: e.usage || null, outcome: e.outcome }); } });
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
