// First visit (15 Oct): the public demo opens on recorded examples. A visitor who types their own business
// got "Recorded mode knows four fictional businesses…" and had to find the mode switch themselves. The
// error now offers one button that runs the same name live, only while live search is set up and quota is
// left, and only on a click (live searches cost quota, so never automatically).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { MESSAGES } from '../src/web/app.mjs';
import { setLang, t } from '../public/i18n.js';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('the recorded-mode message is the one the page recognises for the live button', () => {
  assert.match(MESSAGES.notSample, /knows four fictional/i);
  assert.match(app, /\/knows four fictional\/i\.test\(english\) && demo\?\.live && demo\.left > 0/);
});

test('the live button says which name it searches and how many live searches are left, in both languages', () => {
  setLang('en');
  assert.equal(t('error.searchLive', { q: 'Petimemama, İzmir', n: 3 }), 'Search “Petimemama, İzmir” live (3 left today)');
  setLang('tr');
  assert.equal(t('error.searchLive', { q: 'Petimemama, İzmir', n: 3 }), '“Petimemama, İzmir” için canlı ara (bugün 3 hak)');
  setLang('en');
});

test('the live button only starts a run from its own click handler', () => {
  const block = app.slice(app.indexOf("t('error.searchLive'") - 400, app.indexOf("t('error.searchLive'"));
  assert.match(block, /onclick: \(\) => \{[\s\S]*value="live"\]'\)\.checked = true;[\s\S]*start\(query\);/);
});
