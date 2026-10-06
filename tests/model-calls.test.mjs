// Model transparency: every Nemotron call is recorded with model id, tier, latency, token usage
// (parsed from Token Factory's OpenAI-compatible `usage` field) and what the code checks did with it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain } from '../src/agent/nemotron-brain.mjs';
import { modelTotals, runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { createTokenFactoryClient, parseUsage } from '../src/llm.mjs';

const FAKE_KEY = 'test-not-a-real-key';
const lumen = loadSamples().find((s) => s.id === 'lumen');

// The shape Token Factory returns (OpenAI Chat Completions), including the optional detail objects.
const tfReply = (content, usage) => new Response(JSON.stringify({
  id: 'chatcmpl-test', object: 'chat.completion', model: 'nvidia/nemotron-3-super-120b-a12b',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage,
}), { status: 200, headers: { 'content-type': 'application/json' } });

test('parseUsage reads OpenAI-compatible usage, including reasoning tokens', () => {
  assert.deepEqual(
    parseUsage({ prompt_tokens: 1834, completion_tokens: 412, total_tokens: 2246, prompt_tokens_details: null, completion_tokens_details: { reasoning_tokens: 300 } }),
    { in: 1834, out: 412, total: 2246, reasoning: 300 },
  );
  assert.deepEqual(parseUsage({ prompt_tokens: 10, completion_tokens: 5 }), { in: 10, out: 5, total: 15, reasoning: null }, 'total is summed when missing');
  assert.deepEqual(parseUsage({ input_tokens: '7', output_tokens: '3' }), { in: 7, out: 3, total: 10, reasoning: null }, 'string counts and input/output names');
  assert.deepEqual(parseUsage({ total_tokens: 42 }), { in: null, out: null, total: 42, reasoning: null }, 'never guesses the split');
  assert.deepEqual(parseUsage({ prompt_tokens: -1, completion_tokens: 'many', total_tokens: 9 }), { in: null, out: null, total: 9, reasoning: null });
  for (const bad of [null, undefined, 'x', 7, {}, { foo: 1 }]) assert.equal(parseUsage(bad), null);
});

test('Token Factory client returns parsed usage and latency with the JSON', async () => {
  const llm = createTokenFactoryClient({
    apiKey: FAKE_KEY,
    fetchImpl: async () => tfReply('{"ok":true}', { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }),
  });
  const r = await llm.chat({ system: 's', user: 'u' });
  assert.deepEqual(r.json, { ok: true });
  assert.deepEqual(r.usage, { in: 120, out: 30, total: 150, reasoning: null });
  assert.equal(r.model, 'nvidia/nemotron-3-super-120b-a12b');
  assert.equal(typeof r.ms, 'number');
});

test('an unreadable reply still reports the tokens it cost', async () => {
  const llm = createTokenFactoryClient({
    apiKey: FAKE_KEY,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'I think the answer is' }, finish_reason: 'length' }], usage: { prompt_tokens: 900, completion_tokens: 1200 } }), { status: 200 }),
  });
  const err = await llm.chat({ system: 's', user: 'u' }).catch((e) => e);
  assert.match(err.message, /no valid JSON.*cut off at the token limit/);
  assert.deepEqual(err.call.usage, { in: 900, out: 1200, total: 2100, reasoning: null });
  assert.ok(!err.message.includes(FAKE_KEY));
});

// Scripted Nemotron with realistic usage per role. The Nano rewrite invents a number on purpose.
function scripted() {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const sys = body.messages[0].content;
    if (sys.startsWith('You identify')) {
      return tfReply(JSON.stringify({ name: 'Lumen Coffee Roasters', city: 'Izmir', domain: 'lumencoffee.example', phone: null, reasoning: 'first result' }), { prompt_tokens: 1500, completion_tokens: 80, total_tokens: 1580 });
    }
    if (sys.startsWith('You are an auditor')) {
      return tfReply(JSON.stringify({ claims: [
        { type: 'site_online', rationale: 'loads' },
        { type: 'ssl_expiring_soon', rationale: '9 days' },
        { type: 'site_unreachable', rationale: 'old review' },
      ] }), { prompt_tokens: 2400, completion_tokens: 260, total_tokens: 2660, completion_tokens_details: { reasoning_tokens: 180 } });
    }
    if (sys.startsWith('Rewrite each')) {
      return tfReply(JSON.stringify({ claims: [
        { id: 'site_online', owner_text: 'Your website works.' },
        { id: 'ssl_expiring_soon', owner_text: 'Your certificate expires in 3 days!' },
      ] }), { prompt_tokens: 400, completion_tokens: 60, total_tokens: 460 });
    }
    return tfReply(JSON.stringify({ owner_summary: 'Mostly fine.', pitch: { subject: 'Hi', opening: 'Hello.', findings: [
      { text: 'Your certificate expires soon.', cites: ['ssl_expiring_soon'] },
      { text: 'You lose 40% of sales.', cites: [] },
    ], offer: 'I can help.', closing: 'Thanks.' } }), { prompt_tokens: 700, completion_tokens: 150, total_tokens: 850 });
  };
}

test('every Nemotron call is recorded: model, tier, tokens, latency, and what validation did', async () => {
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, reasoningModel: 'nvidia/nemotron-3-super-120b-a12b', fastModel: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', fetchImpl: scripted() });
  const events = [];
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: createNemotronBrain(llm), emit: (e) => events.push(e) });

  const calls = report.models.calls;
  assert.deepEqual(calls.map((c) => c.stage), ['plan', 'propose', 'verify', 'write']);
  assert.deepEqual(calls.map((c) => c.tier), ['reasoning', 'reasoning', 'fast', 'reasoning']);
  assert.equal(calls[2].model, 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B');
  assert.equal(calls[0].model, 'nvidia/nemotron-3-super-120b-a12b');
  assert.deepEqual(calls[1].usage, { in: 2400, out: 260, total: 2660, reasoning: 180 });
  for (const c of calls) assert.equal(typeof c.ms, 'number');

  assert.equal(calls[0].outcome, 'accepted');
  assert.equal(calls[1].outcome, 'partial');
  assert.match(calls[1].detail, /3 proposed · 2 kept by the gate · 1 dropped by the gate/);
  assert.equal(calls[2].outcome, 'partial', 'the Nano rewrite that invents “3 days” is rejected');
  assert.match(calls[2].detail, /ssl_expiring_soon introduced a number not in the evidence \(3\)/);
  assert.equal(calls[3].outcome, 'partial');
  assert.match(calls[3].detail, /1 sentence\(s\) removed by citation lint/);

  assert.deepEqual(report.models.totals, { calls: 4, failed: 0, tokensIn: 5000, tokensOut: 550, tokens: 5550, tokensKnown: 4, ms: report.models.totals.ms });
  assert.equal(report.stats.modelCalls, 4);
  assert.equal(report.stats.tokens, 5550);
  assert.equal(report.stats.dropped, 1);
  assert.equal(report.stats.rewritesRejected, 1);

  const modelEvents = events.filter((e) => e.type === 'model');
  assert.deepEqual(modelEvents.map((e) => e.stage), ['plan', 'propose', 'verify', 'write']);
  assert.ok(events.indexOf(modelEvents[1]) > events.findLastIndex((e) => e.type === 'gate'), 'proposer outcome is reported after the gate ruled');
  assert.ok(!JSON.stringify(events).includes(FAKE_KEY), 'keys never reach the trace');
});

test('a planner choice removed by the grounding guard is marked partly rejected', async () => {
  const fetchImpl = async (url, init) => {
    const sys = JSON.parse(init.body).messages[0].content;
    if (sys.startsWith('You identify')) return tfReply(JSON.stringify({ name: 'Lumen Coffee Roasters', city: 'Izmir', domain: 'lumen-invented.example', phone: null }), { total_tokens: 10 });
    return scripted()(url, init);
  };
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, fetchImpl });
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: createNemotronBrain(llm) });
  const plan = report.models.calls[0];
  assert.equal(plan.outcome, 'partial');
  assert.match(plan.detail, /lumen-invented\.example never appeared/);
});

test('recorded samples show the stand-in honestly: no tokens, no fake usage', async () => {
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: createSampleBrain(lumen) });
  assert.equal(report.models.calls.length, 4);
  for (const c of report.models.calls) { assert.equal(c.model, 'sample (rule-based)'); assert.equal(c.usage, null); }
  assert.equal(report.models.totals.tokens, null);
  assert.equal(report.stats.tokens, null);
});

test('modelTotals ignores skipped calls and unknown usage', () => {
  const t = modelTotals([
    { usage: { in: 10, out: 2, total: 12 }, ms: 5, outcome: 'accepted' },
    { usage: null, ms: 7, outcome: 'failed' },
    { usage: null, ms: 0, outcome: 'failed', skipped: true },
  ]);
  assert.deepEqual(t, { calls: 2, failed: 2, tokensIn: 10, tokensOut: 2, tokens: 12, tokensKnown: 1, ms: 12 });
});
