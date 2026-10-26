// Landing polish (19 Oct). 1) The hero shows the measured accuracy, so a first-time visitor sees why
// to trust the agent; the numbers must be the ones in docs/accuracy.md. 2) A run's report used to
// wait for the gate animation's last card; when frames stop coming (covered or throttled window)
// the report never appeared. A watchdog now settles the gate and shows the report.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ACCURACY, accuracyPct } from '../public/accuracy.js';
import { mustSettle, STALL_MS } from '../public/gate.js';
import { setLang, t } from '../public/i18n.js';

const doc = fs.readFileSync(new URL('../docs/accuracy.md', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('the landing accuracy matches the fresh-list rounds in docs/accuracy.md', () => {
  let kept = 0;
  let total = 0;
  for (const r of ACCURACY.rounds) {
    const row = doc.split('\n').find((l) => l.startsWith(`| ${r} |`));
    assert.ok(row, `round ${r} is in the results table`);
    const m = /\| (\d+) of (\d+)(?: checkable)?[^|]*\| \**\d+%\**\s*\|$/.exec(row);
    assert.ok(m, `round ${r} row has "x of y" and a percentage`);
    kept += Number(m[1]);
    total += Number(m[2]);
  }
  assert.equal(kept, ACCURACY.kept);
  assert.equal(total, ACCURACY.total);
  assert.equal(accuracyPct(ACCURACY), 96);
});

test('the accuracy line reads right in both languages and links to the measurement page', () => {
  setLang('en');
  assert.equal(t('hero.proof', { kept: '109', total: '114', pct: '96' }),
    'Measured on real businesses: on the last four fresh lists (48 Turkish shops), 109 of 114 kept claims were right (96%), each checked by hand outside Proofline.');
  setLang('tr');
  assert.equal(t('hero.proof', { kept: '109', total: '114', pct: '96' }),
    'Gerçek işletmelerde ölçüldü: son dört taze listede (48 Türk işletmesi) tutulan 114 iddiadan 109 tanesi doğru çıktı (%96); her biri Proofline dışında elle kontrol edildi.');
  assert.equal(t('hero.proofLink'), 'Tüm iddialar ve kontrolleri');
  setLang('en');
  assert.equal(ACCURACY.rounds.length * 12, 48);
  assert.equal(ACCURACY.url, '/proof'); // the measurement page, tests/proof-page.test.mjs
  assert.match(html, /<p id="proof-line" class="proof-line"><\/p>/);
  assert.match(app, /else renderProofLine\(\);/);
});

test('a stalled gate is settled only while the page is visible and after the limit', () => {
  assert.equal(mustSettle({ waitingMs: 0, hidden: false }), false);
  assert.equal(mustSettle({ waitingMs: STALL_MS - 1, hidden: false }), false);
  assert.equal(mustSettle({ waitingMs: STALL_MS, hidden: false }), true);
  assert.equal(mustSettle({ waitingMs: 60000, hidden: true }), false);
});

test('the run report has a watchdog and is shown once', () => {
  const block = app.slice(app.indexOf('const show = () =>'), app.indexOf('st.whenSettled(show);') + 25);
  assert.match(block, /if \(shown \|\| run !== mine\) return; shown = true; clearInterval\(guard\); renderReport/);
  assert.match(block, /mustSettle\(\{ waitingMs: st\.stalledFor\(\), hidden: document\.hidden \}\)\) st\.settleNow\(\)/);
});
