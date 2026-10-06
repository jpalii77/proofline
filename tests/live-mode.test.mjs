// Live-mode code paths with a fake network: the Token Factory client, the Tavily client and the
// Nemotron brain driving the real pipeline. Real calls are tried once keys are available.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain } from '../src/agent/nemotron-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { createTokenFactoryClient, parseJsonReply } from '../src/llm.mjs';
import { readConfig } from '../src/runtime.mjs';
import { createTavilyClient } from '../src/tavily.mjs';

const FAKE_KEY = 'test-not-a-real-key';
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const completion = (content) => jsonResponse({ choices: [{ message: { content } }], usage: { total_tokens: 42 } });

test('parseJsonReply survives think blocks and code fences', () => {
  assert.deepEqual(parseJsonReply('<think>hmm</think>```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('Sure: {"b":[2]} done'), { b: [2] });
  assert.throws(() => parseJsonReply('no json here'));
});

test('Token Factory client sends an OpenAI-compatible request to the right model', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return completion('{"ok":true}'); };
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, reasoningModel: 'nvidia/reasoner', fastModel: 'nvidia/fast', fetchImpl });
  const r = await llm.chat({ tier: 'fast', system: 's', user: { q: 1 } });
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.model, 'nvidia/fast');
  assert.equal(calls[0].url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, `Bearer ${FAKE_KEY}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'nvidia/fast');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.messages[1].content, '{"q":1}');
});

test('Token Factory errors surface with status, and a missing key is refused', async () => {
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, fetchImpl: async () => new Response('nope', { status: 401 }) });
  await assert.rejects(llm.chat({ system: 's', user: 'u' }), /HTTP 401/);
  assert.throws(() => createTokenFactoryClient({ apiKey: '' }), /NEBIUS_API_KEY/);
});

test('fast tier falls back to the reasoning model when no fast model is set', () => {
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, reasoningModel: 'nvidia/r' });
  assert.equal(llm.models.fast, 'nvidia/r');
});

test('Tavily client posts the query and trims results', async () => {
  let sent;
  const t = createTavilyClient({
    apiKey: FAKE_KEY,
    fetchImpl: async (url, init) => { sent = { url, init }; return jsonResponse({ results: [{ title: 'T', url: 'https://a.example', content: 'x'.repeat(2000), score: 0.9 }] }); },
  });
  const r = await t.search('corner shop izmir');
  assert.equal(sent.url, 'https://api.tavily.com/search');
  assert.equal(JSON.parse(sent.init.body).query, 'corner shop izmir');
  assert.equal(r.results[0].content.length, 600);
  const bad = createTavilyClient({ apiKey: FAKE_KEY, fetchImpl: async () => new Response('', { status: 429 }) });
  assert.match((await bad.search('x')).error, /429/);
});

test('without a Nebius key the app falls back to sample mode', () => {
  assert.equal(readConfig({}).sampleMode, true);
  assert.equal(readConfig({ NEBIUS_API_KEY: FAKE_KEY }).sampleMode, false);
  assert.equal(readConfig({ NEBIUS_API_KEY: FAKE_KEY, SAMPLE_MODE: 'true' }).sampleMode, true);
});

// Scripted Nemotron: answers by role, misbehaving on purpose to exercise every guard.
function scriptedNemotron() {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const sys = body.messages[0].content;
    if (sys.startsWith('You identify')) {
      return completion(JSON.stringify({ name: 'Lumen Coffee Roasters', city: 'Izmir', domain: 'lumencoffee.example', phone: '+90 232 555 99 99', reasoning: 'first result' }));
    }
    if (sys.startsWith('You are an auditor')) {
      return completion(`<think>checking</think>${JSON.stringify({ claims: [
        { type: 'site_online', rationale: 'loads' },
        { type: 'ssl_expiring_soon', rationale: '9 days' },
        { type: 'site_unreachable', rationale: 'old review' },
        { type: 'owner_is_rich', rationale: 'vibes' },
      ] })}`);
    }
    if (sys.startsWith('Rewrite each')) {
      return completion(JSON.stringify({ claims: [
        { id: 'site_online', owner_text: 'Your website works.' },
        { id: 'ssl_expiring_soon', owner_text: 'Your certificate expires in 3 days!' },
      ] }));
    }
    return completion(JSON.stringify({ owner_summary: 'Mostly fine.', pitch: { subject: 'Hi', opening: 'Hello.', findings: [
      { text: 'Your certificate expires soon.', cites: ['ssl_expiring_soon'] },
      { text: 'Your site is down.', cites: ['site_unreachable'] },
      { text: 'You lose 40% of sales.', cites: [] },
    ], offer: 'I can help.', closing: 'Thanks.' } }));
  };
}

test('live pipeline: Nemotron decides, code guards (grounding, catalog, gate, numbers, citations)', async () => {
  const sample = loadSamples().find((s) => s.id === 'lumen');
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, reasoningModel: 'nvidia/nemotron-3-super-120b-a12b', fastModel: 'nvidia/fast-test', fetchImpl: scriptedNemotron() });
  const events = [];
  const { report } = await runAgent({ query: sample.input, io: createSampleIO(sample), brain: createNemotronBrain(llm), emit: (e) => events.push(e) });

  const plan = events.find((e) => e.type === 'plan');
  assert.equal(plan.model, 'nvidia/nemotron-3-super-120b-a12b');
  assert.equal(plan.ctx.phone, null, 'invented phone is removed by the grounding guard');
  assert.match(plan.guard.join(' '), /phone/);

  assert.deepEqual(report.rejected.map((r) => r.type), ['owner_is_rich']);
  assert.deepEqual(report.verified.map((c) => c.type).sort(), ['site_online', 'ssl_expiring_soon']);
  assert.deepEqual(report.dropped.map((c) => c.type), ['site_unreachable']);

  const verify = events.find((e) => e.type === 'verify');
  assert.equal(verify.model, 'nvidia/fast-test');
  assert.equal(verify.rejected.length, 1, 'rewrite that invents “3 days” is rejected');
  assert.equal(report.verified.find((c) => c.type === 'ssl_expiring_soon').ownerText, report.verified.find((c) => c.type === 'ssl_expiring_soon').statement);

  assert.deepEqual(report.pitch.findings.map((f) => f.text), ['Your certificate expires soon.']);
  assert.equal(report.pitchRemoved.length, 2);
});
