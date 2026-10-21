// First screen polish (21 Oct audit of the live demo): Turkish words for the ways to get in touch, brand
// names that keep their English capitals under Turkish upper-casing, the examples on a phone's first screen,
// and an empty "Check it" that points at the examples instead of opening the keyboard.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { summaryText } from '../public/report-lang.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('the contact check reads fully Turkish, and an unknown way is left as it is', () => {
  assert.equal(summaryText('Found: phone number', 'tr'), 'Bulundu: telefon numarası');
  assert.equal(summaryText('Found: contact form, WhatsApp link, email address', 'tr'), 'Bulundu: iletişim formu, WhatsApp bağlantısı, e-posta adresi');
  assert.equal(summaryText('Found: carrier pigeon', 'tr'), 'Bulundu: carrier pigeon');
  assert.equal(summaryText('Found: phone number', 'en'), 'Found: phone number');
});

test('"Nebius" and "Tavily" are marked English, so upper-case Turkish does not dot their i', () => {
  assert.match(read('public/index.html'), /<span class="wide" lang="en"> · NVIDIA Nemotron on Nebius<\/span>/);
  const app = read('public/app.js');
  assert.match(app, /const BRAND_TAGS = new Set\(\['tavily'\]\)/);
  assert.match(app, /BRAND_TAGS\.has\(tag\) \? \{ lang: 'en' \}/);
});

test('on a phone, before a run, the examples come right after the box and the header stays one row', () => {
  const css = read('public/app.css');
  const block = css.slice(css.indexOf('21 Oct: first screen on a phone'));
  assert.match(block, /body:not\(\.ran\) \.hero-ask \.samples \{ order: 1;/);
  assert.match(block, /body:not\(\.ran\) \.hero-ask \.modes \{ order: 2;/);
  assert.match(block, /body:not\(\.ran\) \.top \.pill \{ display: none; \}/);
  assert.match(block, /\.tour-time \{ display: none; \}/);
});

test('the recorded-mode note no longer says "below" (on a phone the examples are above it)', () => {
  const i18n = read('public/i18n.js');
  assert.doesNotMatch(i18n, /must not get through\. Pick one below\./);
  assert.doesNotMatch(i18n, /yanlış iddialar var\. Aşağıdan birini seç\./);
});

test('an empty "Check it" in recorded mode moves to the first example instead of the text box', () => {
  const app = read('public/app.js');
  assert.match(app, /const first = recordedOnly\(\) && \$\('#samples \.chip'\);/);
  assert.match(app, /if \(first\) \{ first\.scrollIntoView\(.*\); first\.focus\(\{ preventScroll: true \}\); \} else \$\('#q'\)\.focus\(\);/);
});
