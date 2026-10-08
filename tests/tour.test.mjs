// The optional "How it works" tour (public/tour.js): every step points at something that is on the
// page, every text exists in English and Turkish, and the tour never opens by itself.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DICT } from '../public/i18n.js';
import { NUDGE_KEY, nudgeOnce, setupTour, STEPS } from '../public/tour.js';

const read = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const app = read('app.js');
const tour = read('tour.js');

// Is a simple selector ("#id", ".a.b", ".a h1") present in the markup the page starts with, or in
// the elements app.js builds (h('section', { class: 'block card' ... }))?
function presentIn(sel, markup, built) {
  const first = sel.split(' ')[0];
  const id = /^#([\w-]+)$/.exec(first)?.[1];
  if (id) return new RegExp(`id="${id}"`).test(markup) || new RegExp(`id: '${id}'`).test(built);
  const classes = first.split('.').filter(Boolean);
  const has = (attr) => [...attr.matchAll(/class(?:=|: )["']([^"']+)["']/g)].some((m) => classes.every((c) => m[1].split(/\s+/).includes(c)));
  return has(markup) || has(built);
}

test('four steps, each with a title and a body in English and Turkish', () => {
  assert.equal(STEPS.length, 4);
  for (const s of STEPS) {
    for (const key of [s.title, s.body]) {
      assert.ok(DICT.en[key]?.trim(), `en ${key}`);
      assert.ok(DICT.tr[key]?.trim(), `tr ${key}`);
      assert.notEqual(DICT.en[key], DICT.tr[key], `${key} is translated`);
    }
    assert.ok(s.targets.length >= 1);
  }
  const used = [...tour.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 6);
  for (const k of used) { assert.ok(k in DICT.en, `en ${k}`); assert.ok(k in DICT.tr, `tr ${k}`); }
  for (const k of ['tour.openShort', 'tour.time']) assert.match(html, new RegExp(`data-i18n="${k.replace('.', '\\.')}"`), `button uses ${k}`);
});

test('every step points at an element that exists: on the landing page, or once a run has drawn it', () => {
  for (const s of STEPS) {
    for (const sel of s.targets) assert.ok(presentIn(sel, html, app), `${s.id}: ${sel} exists in index.html or app.js`);
    // the landing page alone must light up something for every step (no run needed)
    assert.ok(s.targets.some((sel) => presentIn(sel, html, '')), `${s.id} has a target on the landing page`);
  }
  assert.match(html, /id="tour-btn"/);
  assert.match(app, /setupTour\(\{ button: \$\('#tour-btn'\)/);
});

test('the button pulses on the first visit only, and a blocked storage is not an error', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(nudgeOnce(storage), true);
  assert.equal(mem.get(NUDGE_KEY), '1');
  assert.equal(nudgeOnce(storage), false);
  assert.equal(nudgeOnce(storage), false);
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  assert.equal(nudgeOnce(blocked), false);
  assert.equal(nudgeOnce(null), false);
});

test('setting up the tour draws nothing and opens nothing: only a click does', () => {
  const listeners = {};
  const classes = new Set();
  const button = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
  };
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  // doc: null proves setup never touches the page; win only offers a timer
  const timers = [];
  const ctl = setupTour({ button, t: (k) => k, storage, doc: null, win: { setTimeout: (fn) => timers.push(fn), matchMedia: () => ({ matches: false }) } });
  assert.equal(ctl.isOpen(), false);
  assert.equal(typeof listeners.click, 'function', 'opens on click');
  assert.ok(classes.has('nudge'), 'first visit: the button draws the eye once');
  timers.forEach((fn) => fn());
  assert.ok(!classes.has('nudge'), 'and then stops');
  const again = new Set();
  setupTour({ button: { ...button, classList: { add: (c) => again.add(c), remove() {} } }, t: (k) => k, storage, doc: null, win: {} });
  assert.ok(!again.has('nudge'), 'second visit: no pulse');
});
