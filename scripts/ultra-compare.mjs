// Ultra vs Super on the planner's hardest job: which website (if any) belongs to the business?
//   NEBIUS_API_KEY=... TAVILY_API_KEY=... node scripts/ultra-compare.mjs
// For each case: one real Tavily search (the same query the agent sends), then the same planner prompt and
// JSON Schema to both models. The expected answers come from our independent checks in eval/verdicts-r3/r4/r5
// (null = the right answer is "cannot tell" / "no own site"). Writes eval/runs/ultra-compare-<date>.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNemotronBrain } from '../src/agent/nemotron-brain.mjs';
import { groundingFrom, intake } from '../src/agent/pipeline.mjs';
import { DISCOVERY_RESULTS, discoveryQuery } from '../src/checks.mjs';
import { createTokenFactoryClient, DEFAULT_REASONING_MODEL } from '../src/llm.mjs';
import { createTavilyClient } from '../src/tavily.mjs';

const ULTRA = process.env.NEBIUS_ULTRA_MODEL || 'nvidia/Nemotron-3-Ultra-550b-a55b';
const SUPER = process.env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL;
const apiKey = process.env.NEBIUS_API_KEY;
const tavilyKey = process.env.TAVILY_API_KEY;
if (!apiKey || !tavilyKey) { console.error('Set NEBIUS_API_KEY and TAVILY_API_KEY first.'); process.exit(1); }

// expect: the acceptable domains; null means "no domain" is the right answer. Source of each in the note.
const CASES = [
  { query: 'Shout', expect: [null, 'shout.com.tr'], note: 'bare common name; namesakes abroad (r4: Shout! TV)' },
  { query: 'Loky', expect: [null], note: 'bare short name; r4 took lokyai.com (an AI company)' },
  { query: 'Hilal AV Market', expect: ['hilalavmarket.com'], note: 'own site, title names products (r4/r5)' },
  { query: 'Eren Hobi', expect: ['erenhobi.com'], note: 'own site, title is the address (r4/r5)' },
  { query: 'Markapia', expect: ['markapia.com'], note: 'own site (r5)' },
  { query: 'Tuba Butik', expect: ['tubabutik.com'], note: 'own site (r5)' },
  { query: 'Toker Bebe', expect: ['tokerbebe.com'], note: 'own site, Ankara store (r4 check)' },
  { query: 'Pet Ankara, Ankara', expect: ['petankara.com.tr'], note: 'own site; "Ankara Pet" is another shop (r4)' },
  { query: 'Osepet', expect: [null], note: 'Shopier seller; osepet.com is a for-sale page (r4/r5)' },
  { query: 'Santral Ankara Diş, Ankara', expect: ['santralankara.com'], note: 'dental clinic (r3)' },
  { query: 'Sunset Boutique Hotel, Antalya', expect: ['sunsetboutiquehotel.com'], note: 'http-only site (r3)' },
  { query: 'Pelops Boutique Otel, Ankara', expect: [null], note: 'booking sites only (r3)' },
];

const tavily = createTavilyClient({ apiKey: tavilyKey });
const brains = Object.fromEntries([ULTRA, SUPER].map((m) => [m, createNemotronBrain(createTokenFactoryClient({ apiKey, reasoningModel: m }))]));
const norm = (d) => (d ? String(d).toLowerCase().replace(/^www\./, '') : null);
const rows = [];
const score = { [ULTRA]: { right: 0, ms: 0, tin: 0, tout: 0, failed: 0 }, [SUPER]: { right: 0, ms: 0, tin: 0, tout: 0, failed: 0 } };

for (const [i, c] of CASES.entries()) {
  const parsed = intake(c.query);
  const s = await tavily.search(discoveryQuery(parsed), { maxResults: DISCOVERY_RESULTS });
  const discovery = s.results || [];
  const grounding = groundingFrom(parsed, { results: discovery });
  const row = { query: c.query, expect: c.expect, note: c.note, searchError: s.error || null, allowed: grounding.domains, answers: {} };
  for (const m of [ULTRA, SUPER]) {
    try {
      const r = await brains[m].plan({ query: c.query, parsed, discovery, grounding });
      const domain = norm(r.json.domain);
      const ok = c.expect.map(norm).includes(domain);
      Object.assign(score[m], { right: score[m].right + (ok ? 1 : 0), ms: score[m].ms + r.ms, tin: score[m].tin + (r.usage?.in || 0), tout: score[m].tout + (r.usage?.out || 0) });
      row.answers[m] = { domain, ok, ms: r.ms, usage: r.usage, reasoning: r.json.reasoning };
    } catch (e) {
      score[m].failed++;
      row.answers[m] = { error: String(e.message || e).slice(0, 200) };
    }
  }
  rows.push(row);
  const short = (m) => { const a = row.answers[m]; return a.error ? 'FAILED' : `${a.ok ? '✓' : '✗'} ${a.domain ?? 'null'} (${(a.ms / 1000).toFixed(1)} s)`; };
  console.log(`[${i + 1}/${CASES.length}] ${c.query.padEnd(32)} Ultra ${short(ULTRA).padEnd(34)} Super ${short(SUPER)}`);
}

console.log('');
for (const [m, s] of Object.entries(score)) {
  const n = CASES.length - s.failed;
  console.log(`${m}: ${s.right}/${CASES.length} right · avg ${(s.ms / Math.max(n, 1) / 1000).toFixed(1)} s · ${s.tin} in + ${s.tout} out tokens${s.failed ? ` · ${s.failed} failed` : ''}`);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'eval', 'runs'), { recursive: true });
const out = join(root, 'eval', 'runs', `ultra-compare-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(out, `${JSON.stringify({ ultra: ULTRA, super: SUPER, score, rows }, null, 2)}\n`);
console.log(`\nSaved ${out}`);
