// The Devpost gallery card on Tavily (docs/gallery/tavily.html) shows numbers from docs/accuracy.md.
// If the measurement table changes, this test fails until the card says the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const card = readFileSync(new URL('../docs/gallery/tavily.html', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../docs/accuracy.md', import.meta.url), 'utf8');

const section = doc.split('## Where Tavily decides the claim')[1].split('\n## ')[0];
const row = (label) => section.split('\n').find((l) => l.startsWith(`| ${label}`)).split('|').map((c) => c.trim());
const first = row('Rounds 1–7');
const last = row('Last four fresh lists');
const all = row('All 19 rounds');
const pct = (cell) => /\(([\d.]+)%\)/.exec(cell)[1];
const frac = (cell) => /(\d+) of (\d+)/.exec(cell).slice(1, 3).join('/');
const text = (k) => {
  const m = new RegExp(`data-k="${k}">([\\s\\S]*?)</div>`).exec(card);
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

test('Tavily-backed share on the card matches accuracy.md (first rounds → last four fresh lists)', () => {
  assert.equal(text('tavily'), `${pct(first[2])}% → ${pct(last[2])}%`);
});

test('"No website of its own" on the card matches accuracy.md', () => {
  assert.equal(text('nosite'), `${frac(first[4])} → ${frac(last[4])}`);
});

test('gate drops decided by a Tavily check match the all-rounds row', () => {
  const [rightly, wrongly, unknown] = all[5].split('/').map((n) => Number(n.trim()));
  assert.equal(text('drops'), `${rightly + wrongly + unknown} ${rightly} rightly`);
});

test('the card uses only the site sans face (no serif, no monospace)', () => {
  assert.match(card, /IBM Plex Sans/);
  assert.doesNotMatch(card, /Fraunces|Geist|monospace|Courier/i);
});
