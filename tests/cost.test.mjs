// The model calls panel adds what a run cost at Nebius list price (public/cost.js).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { callCost, runCost, usdText } from '../public/cost.js';
import { DICT } from '../public/i18n.js';

const SUPER = 'nvidia/nemotron-3-super-120b-a12b';
const NANO = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
const ULTRA = 'nvidia/Nemotron-3-Ultra-550b-a55b';

test('each Nemotron tier is priced per 1M input and output tokens', () => {
  assert.equal(callCost(SUPER, { in: 1e6, out: 1e6 }), 0.3 + 0.9);
  assert.equal(callCost(NANO, { in: 1e6, out: 0 }), 0.06);
  assert.equal(callCost(ULTRA, { in: 0, out: 1e6 }), 3);
});

test('no price is guessed: unknown model, stand-in or missing tokens give null', () => {
  assert.equal(callCost('sample (rule-based)', { in: 10, out: 10 }), null);
  assert.equal(callCost('meta/llama-x', { in: 10, out: 10 }), null);
  assert.equal(callCost(SUPER, null), null);
});

test('a run sums its priced calls and counts the ones it could not price', () => {
  const calls = [
    { model: SUPER, usage: { in: 2000, out: 1000 } },
    { model: NANO, usage: { in: 1000, out: 500 } },
    { model: 'other/model', usage: { in: 9, out: 9 } },
    { model: SUPER, usage: null },
    { model: SUPER, usage: { in: 1e6, out: 1e6 }, skipped: true },
  ];
  const r = runCost(calls);
  assert.equal(r.priced, 2);
  assert.equal(r.unpriced, 1);
  assert.ok(Math.abs(r.usd - (0.0006 + 0.0009 + 0.00006 + 0.00012)) < 1e-12);
  assert.deepEqual(runCost([]), { usd: null, priced: 0, unpriced: 0 });
  assert.deepEqual(runCost(undefined), { usd: null, priced: 0, unpriced: 0 });
});

test('a small cost never reads as $0.00', () => {
  assert.equal(usdText(0.00178), '$0.0018');
  assert.equal(usdText(0.034), '$0.03');
  assert.equal(usdText(null), '');
});

test('both languages carry the cost line with the amount in it', () => {
  for (const lang of Object.keys(DICT)) {
    for (const k of ['models.cost', 'models.costPartial']) assert.match(DICT[lang][k], /\{usd\}/, `${lang} ${k}`);
  }
});

test('every recorded example prices to a real, small amount (all its models are known)', () => {
  const dir = new URL('../fixtures/recorded/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const rec = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const calls = [];
    (function walk(x) {
      if (Array.isArray(x)) return x.forEach(walk);
      if (x && typeof x === 'object') {
        if (typeof x.model === 'string' && x.usage) calls.push({ model: x.model, usage: { in: x.usage.in ?? x.usage.prompt_tokens, out: x.usage.out ?? x.usage.completion_tokens } });
        Object.values(x).forEach(walk);
      }
    })(rec);
    const r = runCost(calls);
    assert.ok(calls.length > 0, f);
    assert.equal(r.unpriced, 0, f);
    assert.ok(r.usd > 0 && r.usd < 0.1, `${f}: ${r.usd}`);
  }
});
