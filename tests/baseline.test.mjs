// The two comparison runs (src/baseline.mjs): web search turned off, and the model asked from memory alone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { aloneRequest, scoreWebsite, TAVILY_OFF, withoutSearch } from '../src/baseline.mjs';
import { catalogForPrompt } from '../src/claims.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';

const lumen = loadSamples().find((s) => s.id === 'lumen');

test('withoutSearch answers every search with an error and leaves the other checks alone', async () => {
  const io = createSampleIO(lumen);
  const off = withoutSearch(io);
  const s = await off.search('Lumen Coffee Roasters Izmir', { purpose: 'discover' });
  assert.deepEqual(s, { results: [], error: TAVILY_OFF });
  assert.deepEqual(await off.dnsLookup(lumen.domain), await io.dnsLookup(lumen.domain));
});

test('with search off the agent still finishes, says search was off, and no search-based step passes on a missing answer', async () => {
  const out = await runAgent({ query: lumen.input, io: withoutSearch(createSampleIO(lumen)), brain: createSampleBrain(lumen) });
  assert.ok(out.report, 'a report is still written');
  assert.ok(out.report.partial.some((p) => p.includes(TAVILY_OFF)), 'the report says web search was off');
  for (const c of out.report.verified) {
    for (const e of c.evidence) assert.ok(!['site.own_site', 'web.own_site_found', 'web.no_closure_signal'].includes(e.check) || e.pass !== null, `${c.type}: a search-based step cannot pass without search`);
  }
});

test('the model-alone request has the same claim catalog and no web data at all', () => {
  const r = aloneRequest('Vitisfera');
  const types = r.schema.schema.properties.claims.items.properties.type.enum;
  assert.deepEqual(types, catalogForPrompt().map((c) => c.type));
  assert.deepEqual(Object.keys(r.user), ['query', 'catalog']);
  assert.match(r.system, /no web access/);
  assert.match(r.system, /use null when you do not know/);
});

test('scoreWebsite: own site, other site, no answer, and a business with no site', () => {
  assert.equal(scoreWebsite('www.vitisfera.co', { site: 'vitisfera.co' }), 'right');
  assert.equal(scoreWebsite('https://abfen.com.tr/', { site: 'abfen.com', alsoOwn: ['abfen.com.tr'] }), 'right');
  assert.equal(scoreWebsite('fiyord.com', { site: 'balikavmarket.net' }), 'wrong');
  assert.equal(scoreWebsite(null, { site: 'bebeto.com' }), 'abstained');
  assert.equal(scoreWebsite(null, { site: 'none' }), 'abstained (right: it has no site)');
  assert.equal(scoreWebsite('azramtesettur.com', { site: 'none' }), 'wrong (it has no site of its own)');
});

test('the truth file covers every business on list 9', () => {
  const list = JSON.parse(readFileSync(new URL('../eval/businesses-9.json', import.meta.url), 'utf8'));
  const truth = JSON.parse(readFileSync(new URL('../eval/truth-9.json', import.meta.url), 'utf8')).businesses;
  assert.deepEqual(Object.keys(truth).sort(), list.map((b) => b.id).sort());
});

test('the with/without Tavily table in accuracy.md matches the verdict files and the model-alone run', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const doc = read('../docs/accuracy.md').split('## With Tavily, without Tavily, and the model alone')[1].split('\n## ')[0];
  const on = JSON.parse(read('../eval/verdicts-r19.json')).summary;
  const off = JSON.parse(read('../eval/verdicts-notavily.json')).summary;
  assert.ok(doc.includes(`Tavily on (round 19, 16 Oct) | ${on.right} of ${on.kept} |`));
  assert.ok(doc.includes(`web search off (\`--no-tavily\`, 23 Oct) | ${off.right} of ${off.kept} | 2 of 10 | ${off.droppedRightly} / ${off.dropped - off.droppedRightly} |`));
  const alone = JSON.parse(read('../eval/runs/2026-10-23-alone.json')).results;
  assert.equal(alone.reduce((n, r) => n + r.built.length, 0), 0, 'the model alone proposed no claims');
  assert.equal(alone.filter((r) => r.website === 'right').length, 2);
});
