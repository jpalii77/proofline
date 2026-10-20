// Does Nemotron 3 Ultra's second opinion help? On every name-only business of the measured lists
// (eval/businesses-4.json to -9.json) whose note says what its own site is ("own site x.com") or that it has
// none ("expected: no website of its own"), this sends the agent's discovery search once (Tavily), asks the
// planner (Super) and Ultra the same question, and scores two policies against the note:
//   Super alone:            the planner's pick is used
//   Super + Ultra agreeing: the pick is used only when Ultra chose the same site (the pipeline's rule)
// "wrong" = a site that is not the business's; "missed" = no site chosen although it has one. The own-site checks
// run after this in the agent and catch many wrong picks; this measures only the model call.
//   NEBIUS_API_KEY=... TAVILY_API_KEY=... NEBIUS_ULTRA_MODEL=... node scripts/second-opinion-compare.mjs
// Writes eval/runs/second-opinion-<date>.json. About 1 Tavily credit and two model calls per business.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNemotronBrain } from '../src/agent/nemotron-brain.mjs';
import { groundingFrom, intake } from '../src/agent/pipeline.mjs';
import { DISCOVERY_RESULTS, discoveryQuery } from '../src/checks.mjs';
import { createTokenFactoryClient, DEFAULT_REASONING_MODEL } from '../src/llm.mjs';
import { createTavilyClient } from '../src/tavily.mjs';
import { normalizeHost } from '../src/text.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The hardest name-only cases, whose list note does not use the "own site x" wording. Each answer is the
// independent check of a measured round.
const KNOWN = {
  anafarta: ['anafarta.com.tr'], // businesses-4.json note; verdicts-r8.json
  lahza: ['lahzaabutik.com'], // note: "own site spelled differently"; verdicts-r9.json
  dp: ['dpperfumum.com.tr'], // verdicts-r10.json / -r11.json (dpperfumum.com.eg is an Egyptian namesake)
  styleme: [null], // sells on Shopier; verdicts-r13.json: a true "no website"
  mk: [null], // sells on Shopier; verdicts-r13.json: mkcollection.com.tr is another firm
  morfose: ['morfose.eu', 'morfose.com.tr'], // note: morfose.com.tr forwards to morfose.eu/tr, its real site
};

/** The acceptable answers from a list note: hosts, [null] (no site), or undefined (the note does not say). */
export function expectedFromNote(note, id = null) {
  if (id && Object.hasOwn(KNOWN, id)) return KNOWN[id];
  const s = String(note || '');
  if (/expected:? no website of its own|Shopier seller[^;]*: expected no website/i.test(s)) return [null];
  const m = /own site ([a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[a-z]+)?)/i.exec(s);
  return m ? [normalizeHost(m[1].split('/')[0])] : undefined;
}

/** Name-only businesses with a known answer, from the measured lists. */
export function bareCases(dir = join(root, 'eval')) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => /^businesses-([4-9])\.json$/.test(x)).sort()) {
    const list = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const b of list.businesses || list) {
      const parsed = intake(b.query);
      if (parsed.error || parsed.city || parsed.domain) continue;
      const expect = expectedFromNote(b.note, b.id);
      if (expect === undefined) continue;
      out.push({ list: f, id: b.id, query: b.query, expect });
    }
  }
  return out;
}

/** wrong: a site that is not the business's; missed: no site although it has one. */
export function score(pick, expect) {
  if (expect.includes(pick)) return 'right';
  if (!pick) return 'missed';
  return 'wrong';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apiKey = process.env.NEBIUS_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  const ultraModel = process.env.NEBIUS_ULTRA_MODEL || 'nvidia/Nemotron-3-Ultra-550b-a55b';
  if (!apiKey || !tavilyKey) { console.error('Set NEBIUS_API_KEY and TAVILY_API_KEY first.'); process.exit(1); }
  const llm = createTokenFactoryClient({ apiKey, reasoningModel: process.env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL, ultraModel });
  const brain = createNemotronBrain(llm);
  const tavily = createTavilyClient({ apiKey: tavilyKey });
  const cases = bareCases();
  const tally = { superAlone: { right: 0, wrong: 0, missed: 0 }, withUltra: { right: 0, wrong: 0, missed: 0 }, failed: 0, ultraCalls: 0, tokens: { super: 0, ultra: 0 }, ms: { super: 0, ultra: 0 } };
  const rows = [];
  for (const [i, c] of cases.entries()) {
    const parsed = intake(c.query);
    const s = await tavily.search(discoveryQuery(parsed), { maxResults: DISCOVERY_RESULTS });
    const discovery = s.results || [];
    const grounding = groundingFrom(parsed, { results: discovery });
    const args = { query: c.query, parsed, discovery, grounding };
    const row = { ...c, searchError: s.error || null };
    try {
      const p = await brain.plan(args);
      tally.tokens.super += p.usage?.total || 0; tally.ms.super += p.ms || 0;
      const pick = p.json?.domain && grounding.domains.includes(normalizeHost(p.json.domain)) ? normalizeHost(p.json.domain) : null;
      let final = pick;
      row.super = { pick, reasoning: p.json?.reasoning || '' };
      if (pick) {
        tally.ultraCalls++;
        try {
          const u = await brain.second(args);
          tally.tokens.ultra += u.usage?.total || 0; tally.ms.ultra += u.ms || 0;
          const other = u.json?.domain ? normalizeHost(u.json.domain) : null;
          row.ultra = { pick: other, reasoning: u.json?.reasoning || '' };
          if (other !== pick) final = null;
        } catch (e) { row.ultra = { error: String(e.message || e).slice(0, 200) }; } // no answer: the planner's pick stands, as in the agent
      }
      row.superAlone = score(pick, c.expect);
      row.withUltra = score(final, c.expect);
      tally.superAlone[row.superAlone]++;
      tally.withUltra[row.withUltra]++;
    } catch (e) {
      tally.failed++;
      row.error = String(e.message || e).slice(0, 200);
    }
    rows.push(row);
    console.log(`${String(i + 1).padStart(2)}/${cases.length} ${c.query.padEnd(26)} expect ${c.expect.map((x) => x || 'none').join('|')} · super ${row.super?.pick || 'none'} (${row.superAlone || 'error'}) · ultra ${row.ultra ? row.ultra.pick || row.ultra.error || 'none' : '-'} → ${row.withUltra || 'error'}`);
  }
  const day = new Date().toISOString().slice(0, 10);
  const out = join(root, 'eval', 'runs', `second-opinion-${day}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ day, models: { reasoning: llm.models.reasoning, ultra: ultraModel }, cases: cases.length, tally, rows }, null, 2)}\n`);
  console.log(`\nSuper alone:        ${tally.superAlone.right} right, ${tally.superAlone.wrong} wrong site, ${tally.superAlone.missed} missed`);
  console.log(`Super + Ultra agree: ${tally.withUltra.right} right, ${tally.withUltra.wrong} wrong site, ${tally.withUltra.missed} missed`);
  console.log(`Ultra asked ${tally.ultraCalls} times · tokens Super ${tally.tokens.super}, Ultra ${tally.tokens.ultra} · ${tally.failed} failed · saved ${out}`);
}
