// What a run cost in dollars, from the token counts the model calls panel already shows.
// List prices per 1M tokens on Nebius Token Factory, read 26 Oct 2026 (Super and Nano agree across two price
// trackers; the Ultra price comes from one, benchlm.ai/hosts/nebius). An estimate: no discounts, no caching.

export const PRICES_AS_OF = '2026-10-26';

/** [pattern on the model id, $ per 1M input tokens, $ per 1M output tokens]. Output includes reasoning tokens. */
export const PRICES = [
  [/nemotron-3-super-120b/i, 0.3, 0.9],
  [/nemotron-3-nano-30b/i, 0.06, 0.24],
  [/nemotron-3-ultra-550b/i, 1.0, 3.0],
];

/** Dollars for one call, or null when the model has no known price or the call has no token counts. */
export function callCost(model, usage) {
  if (!usage || typeof model !== 'string') return null;
  const price = PRICES.find(([re]) => re.test(model));
  if (!price) return null;
  const tokensIn = Number(usage.in) || 0;
  const tokensOut = Number(usage.out) || 0;
  return (tokensIn * price[1] + tokensOut * price[2]) / 1e6;
}

/** Sum over a run's calls: { usd, priced, unpriced }; usd is null when no call could be priced. */
export function runCost(calls) {
  let usd = 0;
  let priced = 0;
  let unpriced = 0;
  for (const c of Array.isArray(calls) ? calls : []) {
    if (!c || c.skipped || !c.usage) continue;
    const v = callCost(c.model, c.usage);
    if (v == null) unpriced++;
    else { usd += v; priced++; }
  }
  return { usd: priced ? usd : null, priced, unpriced };
}

/** "$0.0042": four decimals below a cent, two above, so a run's cost never reads as $0.00. */
export function usdText(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return '';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
