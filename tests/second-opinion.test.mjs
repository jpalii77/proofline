// Nemotron 3 Ultra as a second opinion (20 Oct). With only a name typed, the planner's website pick was the call
// most often wrong in the measured rounds (a namesake's site). When NEBIUS_ULTRA_MODEL is set, Ultra answers the
// same question on its own and the pick stands only if both chose the same site.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain, MAX_TOKENS } from '../src/agent/nemotron-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';

const html = (title, body = '') => `<html lang="tr"><head><title>${title}</title></head><body>${body}</body></html>`;

function fakeIO({ pages = {}, results = [] } = {}) {
  return {
    mode: 'test',
    async dnsLookup() { return { a: ['192.0.2.10'], aaaa: [] }; },
    async fetchPage(url) {
      const b = pages[url];
      return b ? { status: 200, finalUrl: url, chain: [{ url, status: 200 }], body: b } : { status: null, finalUrl: url, chain: [], error: 'ENOTFOUND' };
    },
    async tlsCert() { return { validTo: new Date(Date.now() + 90 * 86400000).toISOString(), authorized: true }; },
    async nominatim() { return { results: [] }; },
    async search(q, { purpose } = {}) { return purpose === 'discover' ? { results } : { results: [] }; },
  };
}

const reply = (json, model = 'super') => Promise.resolve({ json, model, ms: 5 });
function brainWith({ plan, second, ultra = true }) {
  const asked = [];
  return {
    asked,
    models: { reasoning: 'super', fast: 'nano', ...(ultra ? { ultra: 'ultra' } : {}) },
    plan: () => { asked.push('plan'); return reply(plan); },
    ...(second === undefined ? {} : { second: () => { asked.push('second'); return typeof second === 'function' ? second() : reply(second, 'ultra'); } }),
    propose: () => reply({ claims: [] }),
    verify: () => reply({ claims: [] }),
    write: () => reply({ owner_summary: '', pitch: { subject: '', opening: '', findings: [], offer: '', closing: '' } }),
  };
}

// "Shout": a namesake abroad (round 4: a US TV channel) and the Turkish shop, both in the results
const results = [
  { url: 'https://shout.example/', title: 'Shout! TV', content: 'Shout! streaming channel' },
  { url: 'https://www.shout.com.tr/', title: 'Shout', content: 'Shout giyim, İstanbul' },
];
const pages = { 'https://shout.example/': html('Shout! TV', '<p>Stream Shout! movies</p>') };
const plan = (domain) => ({ name: 'Shout', city: null, domain, phone: null, reasoning: '' });
const call = (report, stage) => report.models.calls.find((c) => c.stage === stage);

test('bare name, both models pick the same site: it is used, and the panel says Ultra agreed', async () => {
  const brain = brainWith({ plan: plan('shout.example'), second: plan('shout.example') });
  const { report } = await runAgent({ query: 'Shout', io: fakeIO({ pages, results }), brain });
  assert.deepEqual(brain.asked, ['plan', 'second']);
  const c = call(report, 'second');
  assert.equal(c.model, 'ultra');
  assert.equal(c.tier, 'ultra');
  assert.equal(c.role, 'Second opinion');
  assert.match(c.detail, /agreed: shout\.example/);
  assert.doesNotMatch(call(report, 'plan').detail || '', /two models/, 'agreement removes nothing');
});

test('bare name, the models disagree: neither pick is taken, and the reason stays on screen', async () => {
  const brain = brainWith({ plan: plan('shout.example'), second: plan('shout.com.tr') });
  const { report } = await runAgent({ query: 'Shout', io: fakeIO({ pages, results }), brain });
  assert.notEqual(report.ctx.domain, 'shout.example', 'the planner\'s namesake pick is not used');
  const c = call(report, 'second');
  assert.equal(c.outcome, 'partial');
  assert.match(c.detail, /disagreed: Ultra chose shout\.com\.tr, the planner shout\.example/);
  assert.match(call(report, 'plan').detail, /two models chose different websites/);
  const order = report.models.calls.map((x) => x.stage);
  assert.equal(order.indexOf('second'), order.indexOf('plan') + 1, 'the second opinion is listed right after the planner');
});

test('Ultra choosing "no website" also counts as a disagreement', async () => {
  const brain = brainWith({ plan: plan('shout.example'), second: plan(null) });
  const { report } = await runAgent({ query: 'Shout', io: fakeIO({ pages, results }), brain });
  assert.match(call(report, 'second').detail, /Ultra chose no website/);
  assert.notEqual(report.ctx.domain, 'shout.example');
});

test('no second opinion when a city or a domain was typed, when the planner chose nothing, or when Ultra is not set', async () => {
  for (const [query, brain] of [
    ['Shout, İstanbul', brainWith({ plan: { ...plan('shout.example'), city: 'İstanbul' }, second: plan('shout.com.tr') })],
    ['Shout, shout.example', brainWith({ plan: plan('shout.example'), second: plan('shout.com.tr') })],
    ['Shout', brainWith({ plan: plan(null), second: plan('shout.com.tr') })],
    ['Shout', brainWith({ plan: plan('shout.example'), second: plan('shout.com.tr'), ultra: false })],
  ]) {
    await runAgent({ query, io: fakeIO({ pages, results }), brain });
    assert.deepEqual(brain.asked, ['plan'], query);
  }
});

test('Ultra not answering keeps the planner\'s pick, which still has to pass the own-site checks', async () => {
  const brain = brainWith({ plan: plan('shout.example'), second: () => Promise.reject(new Error('Token Factory: no answer within 60 s')) });
  const { report } = await runAgent({ query: 'Shout', io: fakeIO({ pages, results }), brain });
  const c = call(report, 'second');
  assert.equal(c.outcome, 'failed');
  assert.match(c.detail, /no answer .*the planner's pick shout\.example goes on to the checks/);
  assert.doesNotMatch(call(report, 'plan').detail || '', /two models/);
});

test('the live brain asks Ultra only when NEBIUS_ULTRA_MODEL gives it one, with the planner\'s question and more room', async () => {
  const sent = [];
  const llm = (models) => ({ models, chat: async (req) => { sent.push(req); return { json: {}, model: models[req.tier] }; } });
  assert.equal(createNemotronBrain(llm({ reasoning: 's', fast: 'n' })).second, undefined);
  const b = createNemotronBrain(llm({ reasoning: 's', fast: 'n', ultra: 'u' }));
  assert.equal(b.models.ultra, 'u');
  const args = { query: 'Shout', parsed: { name: 'Shout' }, discovery: [], grounding: { domains: [], phones: [] } };
  await b.plan(args);
  await b.second(args);
  assert.equal(sent[1].tier, 'ultra');
  assert.equal(sent[1].system, sent[0].system, 'same question, asked independently');
  assert.deepEqual(sent[1].user, sent[0].user, 'Ultra is not told what the planner chose');
  assert.ok(sent[1].maxTokens > sent[0].maxTokens && sent[1].maxTokens === MAX_TOKENS.second);
});

test('the measurement set: name-only businesses whose right answer the measured rounds settled', async () => {
  const { bareCases, expectedFromNote, score } = await import('../scripts/second-opinion-compare.mjs');
  assert.deepEqual(expectedFromNote('e-shop; name only; own site vitisfera.co (a .co ending)'), ['vitisfera.co']);
  assert.deepEqual(expectedFromNote('Shopier seller; name only; expected: no website of its own'), [null]);
  assert.equal(expectedFromNote('seller from the Saker list; name only'), undefined, 'no answer, not measured');
  assert.deepEqual(expectedFromNote('', 'lahza'), ['lahzaabutik.com']);
  const cases = bareCases();
  assert.equal(cases.length, 46);
  assert.ok(cases.every((c) => !/,/.test(c.query)), 'name only: no city, no domain');
  for (const id of ['dp', 'mk', 'styleme', 'lahza', 'bebeto']) assert.ok(cases.some((c) => c.id === id), id);
  assert.equal(score('x.com', ['x.com']), 'right');
  assert.equal(score(null, [null]), 'right');
  assert.equal(score(null, ['x.com']), 'missed');
  assert.equal(score('y.com', [null]), 'wrong');
});

test('a slow second opinion is cut off at 15 s and the run goes on with the planner\'s pick', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const brain = brainWith({ plan: plan('shout.example'), second: () => new Promise(() => {}) });
  const run = runAgent({ query: 'Shout', io: fakeIO({ pages, results }), brain });
  for (let i = 0; i < 50; i++) { await new Promise((r) => setImmediate(r)); t.mock.timers.tick(1000); }
  const { report } = await run;
  const c = call(report, 'second');
  assert.equal(c.outcome, 'failed');
  assert.match(c.detail, /no answer within 15 s.*the planner's pick shout\.example goes on to the checks/);
  assert.ok(report.models.calls.some((x) => x.stage === 'write'), 'the later steps still ran');
});
