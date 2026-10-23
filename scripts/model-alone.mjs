// Baseline: what Nemotron says about each business from memory alone (no search, no checks), and how many of
// those claims the gate would keep. Compare with the full agent's round on the same list.
//   NEBIUS_API_KEY=... TAVILY_API_KEY=... node scripts/model-alone.mjs eval/businesses-9.json eval/truth-9.json
// Writes eval/runs/<date>-alone.json. The model makes one call per business; the gate then re-proves each claim
// with live checks (Tavily is used only by the gate, never shown to the model). Every claim is still judged by a
// person afterwards, like every other round.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aloneRequest, scoreWebsite } from '../src/baseline.mjs';
import { discoveryQuery } from '../src/checks.mjs';
import { buildClaim, gateClaim } from '../src/claims.mjs';
import { createNodeNet } from '../src/io/net-node.mjs';
import { observed } from '../src/io/observed.mjs';
import { createRealIO } from '../src/io/real.mjs';
import { createTokenFactoryClient } from '../src/llm.mjs';
import { configProblem, readConfig } from '../src/runtime.mjs';
import { createTavilyClient } from '../src/tavily.mjs';
import { normalizeHost } from '../src/text.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [listArg, truthArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cfg = readConfig();
if (cfg.sampleMode) { console.error('This comparison needs live mode (unset SAMPLE_MODE).'); process.exit(1); }
const problem = configProblem(cfg);
if (problem) { console.error(problem); process.exit(1); }

const list = JSON.parse(readFileSync(listArg || join(root, 'eval', 'businesses-9.json'), 'utf8'));
const truth = truthArg ? JSON.parse(readFileSync(truthArg, 'utf8')).businesses : {};
const llm = createTokenFactoryClient({ ...cfg.nebius });
const tavily = createTavilyClient({ apiKey: cfg.tavilyKey });
const day = new Date().toISOString().slice(0, 10);
const outPath = join(root, 'eval', 'runs', `${day}-alone.json`);
mkdirSync(dirname(outPath), { recursive: true });
const results = [];
const save = () => writeFileSync(outPath, JSON.stringify({ day, kind: 'model-alone', model: cfg.nebius.reasoningModel, list: listArg || 'eval/businesses-9.json', results }, null, 2) + '\n');

for (const [i, item] of list.entries()) {
  process.stdout.write(`[${i + 1}/${list.length}] ${item.query} … `);
  const row = { id: item.id, query: item.query, answer: null, model: null, website: null, built: [], kept: [], dropped: [], error: null };
  try {
    const out = await llm.chat(aloneRequest(item.query));
    row.answer = out.json;
    row.model = { model: out.model, ms: out.ms, usage: out.usage || null, format: out.format || null };
    if (truth[item.id]) row.website = scoreWebsite(out.json?.website, truth[item.id]);
    const name = out.json?.name || item.query.split(',')[0].trim();
    const city = out.json?.city || null;
    const ctx = { name, city, identityCity: city, domain: normalizeHost(out.json?.website || '') || null, phone: out.json?.phone || null, searchQuery: discoveryQuery({ name, city }) };
    const io = observed(createRealIO({ net: createNodeNet(), tavily, nominatimContact: cfg.nominatimContact }));
    for (const c of out.json?.claims || []) {
      const b = buildClaim(c.type, ctx, { rationale: c.rationale, proposedBy: 'model-alone' });
      if (!b.ok) { row.built.push({ type: c.type, rejected: b.reason }); continue; }
      row.built.push({ type: c.type, statement: b.claim.statement });
      const g = await gateClaim(io, b.claim);
      const { proof, ...plain } = g; // eslint-disable-line no-unused-vars
      (g.verdict === 'verified' ? row.kept : row.dropped).push(plain);
    }
  } catch (e) {
    row.error = String(e?.message || e);
  }
  results.push(row);
  save();
  console.log(row.error ? `error: ${row.error}` : `website ${row.website ?? '?'}; ${row.built.length} claims, gate kept ${row.kept.length}`);
  await new Promise((ok) => setTimeout(ok, 3000));
}
console.log(`\nSaved ${outPath}`);
