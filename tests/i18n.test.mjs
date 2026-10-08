// Interface language (public/i18n.js): every English text has a Turkish one, the language is picked
// from ?lang=, the saved choice and the browser language, and numbers follow the language.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { CLAIM_TYPES } from '../src/claims.mjs';
import { MESSAGES } from '../src/web/app.mjs';
import { friendlyError } from '../src/limits.mjs';
import { labelTables, SHORT } from '../public/gate-data.js';
import { DICT, getLang, num, pickLang, serverText, setLang, t } from '../public/i18n.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every English key has a Turkish text, and no text is empty', () => {
  for (const lang of ['en', 'tr']) {
    for (const [k, v] of Object.entries(DICT[lang])) assert.ok(typeof v === 'string' && v.trim(), `${lang}.${k} is empty`);
  }
  assert.deepEqual(Object.keys(DICT.tr).sort(), Object.keys(DICT.en).sort(), 'both languages have the same keys');
  for (const k of Object.keys(DICT.en)) assert.deepEqual(vars(DICT.tr[k]), vars(DICT.en[k]), `tr.${k} uses the same {placeholders}`);
});

test('the page only uses keys that exist', () => {
  const used = new Set();
  for (const f of ['index.html', 'app.js', 'gate.js', 'gate-data.js']) {
    const src = fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]);
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(k in DICT.en || `${k}_one` in DICT.en, `key ${k} is defined`);
});

test('Turkish claim labels fit the gate cards like the English ones', () => {
  const tr = labelTables('tr');
  for (const type of Object.keys(CLAIM_TYPES)) {
    assert.ok(tr.short[type], `${type} has a Turkish card label`);
    assert.ok(!/\d/.test(tr.short[type]), `Turkish label for ${type} carries no number`);
    assert.ok(tr.mini[type].length <= 18, `Turkish narrow label for ${type} fits a phone card`);
    assert.ok(tr.mini[type].split(' ').every((w) => w.length <= 11), `Turkish narrow label for ${type} wraps cleanly`);
  }
  assert.deepEqual(Object.keys(tr.short).sort(), Object.keys(SHORT).sort());
});

test('?lang= wins, then the saved choice, then the browser language', () => {
  assert.equal(pickLang({ search: '?lang=tr', stored: 'en', navLangs: ['en-US'] }), 'tr');
  assert.equal(pickLang({ search: '?q=x&lang=en', stored: 'tr', navLangs: ['tr-TR'] }), 'en');
  assert.equal(pickLang({ search: '?lang=TR' }), 'tr');
  assert.equal(pickLang({ search: '?lang=de', stored: 'tr' }), 'tr', 'an unknown ?lang= is ignored');
  assert.equal(pickLang({ stored: 'tr', navLangs: ['en-US'] }), 'tr');
  assert.equal(pickLang({ stored: 'en', navLangs: ['tr-TR'] }), 'en');
});

test('default language: Turkish browsers get Turkish, everyone else English', () => {
  assert.equal(pickLang({ navLangs: ['tr-TR', 'en-US'] }), 'tr');
  assert.equal(pickLang({ navLangs: ['tr'] }), 'tr');
  assert.equal(pickLang({ navLangs: ['en-GB', 'tr-TR'] }), 'en', 'the first browser language decides');
  assert.equal(pickLang({ navLangs: ['de-DE'] }), 'en');
  assert.equal(pickLang({ navLangs: [] }), 'en');
  assert.equal(pickLang(), 'en');
});

test('texts, plurals and numbers follow the language', () => {
  try {
    setLang('en');
    assert.equal(getLang(), 'en');
    assert.equal(t('gate.atGate', { n: 1 }), '1 proposed claim at the gate');
    assert.equal(t('gate.atGate', { n: 3 }), '3 proposed claims at the gate');
    assert.equal(num(12345.6, { maximumFractionDigits: 1 }), '12,345.6');
    setLang('tr');
    assert.equal(t('gate.atGate', { n: 3 }), 'Kanıt kapısında 3 önerilen iddia');
    assert.equal(t('stat.verified'), 'doğrulandı');
    assert.equal(t('stat.dropped'), 'elendi');
    assert.equal(num(12345.6, { maximumFractionDigits: 1 }), '12.345,6');
    assert.equal(t('no.such.key'), 'no.such.key');
  } finally { setLang('en'); }
});

test('fixed server messages are shown in Turkish; anything else as sent', () => {
  try {
    setLang('tr');
    for (const m of Object.values(MESSAGES)) assert.notEqual(serverText(m), m, `server message has a Turkish text: ${m}`);
    for (const e of ['too many subrequests', 'cpu exceeded', 'Token Factory HTTP 429', 'Token Factory HTTP 500', 'boom']) {
      const m = friendlyError(new Error(e));
      assert.notEqual(serverText(m), m, `friendly error has a Turkish text: ${m}`);
    }
    assert.equal(serverText('Some new message.'), 'Some new message.');
    setLang('en');
    assert.equal(serverText(MESSAGES.empty), MESSAGES.empty);
  } finally { setLang('en'); }
});
