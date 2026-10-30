// The one-page sheet for judges (docs/gallery/judge-sheet.html) shows numbers from docs/accuracy.md and
// public/cost.js. If a table changes, this test fails until the sheet says the same.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PRICES } from '../public/cost.js';

const sheet = readFileSync(new URL('../docs/gallery/judge-sheet.html', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../docs/accuracy.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const section = (title) => doc.split(`## ${title}`)[1].split('\n## ')[0];
const row = (title, label) => section(title).split('\n').find((l) => l.startsWith(`| ${label}`)).split('|').map((c) => c.trim());
const text = (k) => {
  const m = new RegExp(`data-k="${k}">([\\s\\S]*?)</div>`).exec(sheet);
  assert.ok(m, `data-k="${k}" on the sheet`);
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

test('fresh-list accuracy matches the status line of accuracy.md', () => {
  const m = /last four fresh lists[^*]*?(\d+) of (\d+) checkable kept claims were right \((\d+)%\)/.exec(doc);
  assert.equal(text('fresh'), `${m[3]}% ${m[1]} of ${m[2]}`);
});

test('wrong claims without → with the gate match the all-rounds row', () => {
  const r = row('Without the gate', '**All 19**');
  const wrongWith = /\/ (\d+) \(/.exec(r[2])[1];
  const wrongWithout = /\/ (\d+) \(/.exec(r[3])[1];
  assert.equal(text('gate'), `${wrongWithout} → ${wrongWith}`);
});

test('reports with a wrong sentence match the last-four-lists row', () => {
  const r = row('Per report: would the message have carried a false sentence?', 'Last four fresh lists');
  assert.equal(text('reports'), `${r[3]} of ${r[2]} reports`);
  assert.match(sheet, new RegExp(`\\(${r[4]} without the gate\\)`));
});

test('Tavily-backed share matches "Where Tavily decides the claim"', () => {
  const pct = (cell) => /\(([\d.]+)%\)/.exec(cell)[1];
  const first = row('Where Tavily decides the claim', 'Rounds 1–7');
  const last = row('Where Tavily decides the claim', 'Last four fresh lists');
  assert.equal(text('tavily'), `${pct(first[2])}% → ${pct(last[2])}%`);
});

test('sites found with and without search match the with/without Tavily table', () => {
  const on = row('With Tavily, without Tavily, and the model alone', 'Full agent');
  const off = row('With Tavily, without Tavily, and the model alone', 'Same agent, web search off');
  const alone = row('With Tavily, without Tavily, and the model alone', 'Nemotron 3 Super alone');
  assert.equal(text('sites'), `${on[3]} sites`);
  assert.match(sheet, new RegExp(`${off[3]} with search off`));
  assert.equal(alone[2], '0 claims');
  assert.match(sheet, /the model alone made 0 claims/);
});

test('model prices on the sheet are the ones the panel uses, and the cost range is the README one', () => {
  assert.equal(PRICES.length, 3);
  assert.match(readme, /cost between \$0\.002 and \$0\.004 each/);
  assert.equal(text('cost'), '$0.002–0.004');
});

test('links on the sheet are the README ones', () => {
  for (const url of ['https://proofline-demo.dwelltime-yayin.workers.dev', 'https://youtu.be/fYQCcudvnsI', 'https://github.com/jpalii77/proofline']) {
    assert.ok(readme.includes(url), `README ${url}`);
    assert.ok(sheet.includes(`href="${url}"`), `sheet ${url}`);
  }
});

test('the sheet uses only the site sans face (no serif, no monospace) and fits one A4 page', () => {
  assert.match(sheet, /IBM Plex Sans/);
  assert.doesNotMatch(sheet, /Fraunces|Geist|monospace|Courier/i);
  assert.match(sheet, /@page \{ size: A4; margin: 0; \}/);
  assert.match(sheet, /height: 297mm;[^}]*overflow: hidden/);
});
