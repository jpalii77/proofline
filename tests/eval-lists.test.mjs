// Accuracy round 8 (planned 12 Oct 2026): rounds 4-7 re-ran one list, so its 100% may only mean the fixes fit
// those 12 shops. eval/businesses-4.json is a fresh list (no business seen before) with mixed input:
// name + domain, name + city and bare names. These tests keep every list well-formed and the new one honest.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { intake } from '../src/agent/pipeline.mjs';

const evalDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const lists = readdirSync(evalDir).filter((f) => /^businesses(-\d+)?\.json$/.test(f)).sort();
const load = (f) => JSON.parse(readFileSync(join(evalDir, f), 'utf8'));
const key = (q) => intake(q).name.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g, '');

test('every business list: an array of { id, query, note } with unique ids', () => {
  assert.ok(lists.length >= 4, `found ${lists.join(', ')}`);
  for (const f of lists) {
    const items = load(f);
    assert.ok(Array.isArray(items) && items.length > 0, f);
    const ids = new Set();
    for (const it of items) {
      assert.equal(typeof it.query, 'string', `${f}: query`);
      assert.ok(it.query.trim().length > 1, `${f}: empty query`);
      assert.ok(it.id && !ids.has(it.id), `${f}: duplicate or missing id ${it.id}`);
      ids.add(it.id);
      assert.ok(intake(it.query).name, `${f}: ${it.query} has no name after intake`);
    }
  }
});

test('round-8 list: 12 businesses, none seen in an earlier list', () => {
  const fresh = load('businesses-4.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-4.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
});

test('round-8 list: mixed input, read by intake as intended', () => {
  const parsed = load('businesses-4.json').map((it) => ({ id: it.id, ...intake(it.query) }));
  const withDomain = parsed.filter((p) => p.domain);
  const withCity = parsed.filter((p) => p.city && !p.domain);
  const bare = parsed.filter((p) => !p.city && !p.domain);
  assert.deepEqual(withDomain.map((p) => p.domain), ['nuuwears.com', 'cosmetica.com.tr']);
  assert.deepEqual(withCity.map((p) => p.city), ['Antakya', 'Bergama']);
  assert.equal(bare.length, 8);
  assert.equal(parsed.find((p) => p.id === 'dp').name, 'D&P Perfumum', 'the & stays part of the name');
  assert.equal(parsed.find((p) => p.id === 'cakil').name, 'Çakıl Butik', 'Turkish letters survive intake');
});

// Round 12 (14 Oct): rounds 8-11 re-ran one list and its fixes may fit those 12 shops only. A second fresh
// list, again mixed: 2 name + domain (one a registered but unconnected Wix domain), 2 name + city, 8 bare.
test('round-12 list: 12 businesses, none seen in an earlier list, mixed input', () => {
  const fresh = load('businesses-5.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-5.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
  const parsed = fresh.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['morncoffee.com', 'kivircikkizlargelsin.com']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['İstanbul', 'Ümraniye']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
  assert.equal(parsed.find((p) => p.id === 'kivircik').name, 'Kıvırcık Kızlar Gelsin');
});

// Round 14 (14 Oct): round 13 re-ran the round-12 list after its fixes; a third fresh list checks them
// on businesses they were not made for. Same mix; traps: a forwarding .com.tr, two foreign namesake addresses.
test('round-14 list: 12 businesses, none seen in an earlier list, mixed input', () => {
  const fresh = load('businesses-6.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-6.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
  const parsed = fresh.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['sirri.com.tr', 'melisgold.com']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['İzmir', 'İstanbul']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
  assert.equal(parsed.find((p) => p.id === 'fatma').name, "Fatma Ana'dan", 'the apostrophe stays part of the name');
});

// Round 16 (14 Oct): the lost-finding fixes (contact page for the city, Turkish site for a bare name) were
// re-measured on the list they were made for (round 15); a fourth fresh list is the real test before release.
test('round-16 list: 12 businesses, none seen in an earlier list, mixed input', () => {
  const fresh = load('businesses-7.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-7.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
  const parsed = fresh.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['vettamoda.com', 'akgulkolonya.com']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['Çanakkale', 'Ankara']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
});

// Round 18 (15 Oct): the audit fixes (refused answers, Turkish-letter markers) and round 17 measured on a
// fifth fresh list before release. Same mix; traps: a site address without a word of the name (Güneş Tıp
// Kitabevi), common English words with namesakes abroad (Ocean Marine), a very common shop name with no site.
test('round-18 list: 12 businesses, none seen in an earlier list, mixed input', () => {
  const fresh = load('businesses-8.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-8.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
  const parsed = fresh.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['cizgitriko.com', 'ceransaat.com']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['İzmir', 'Mersin']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
  assert.equal(parsed.find((p) => p.id === 'gunes').name, 'Güneş Tıp Kitabevi');
});

// Round 19 (16 Oct): the round-18 fix (schema.org names, a shortened name-built address) and the release
// measured on a sixth fresh list. Same mix; traps: addresses that leave out part of the name (abfen.com.tr,
// balikavmarket.net), a .co ending, a dotted name, a one-word brand with namesakes.
test('round-19 list: 12 businesses, none seen in an earlier list, mixed input', () => {
  const fresh = load('businesses-9.json');
  assert.equal(fresh.length, 12);
  const seen = new Set(lists.filter((f) => f !== 'businesses-9.json').flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of fresh) assert.ok(!seen.has(key(it.query)), `${it.query} was already measured`);
  const parsed = fresh.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['modasaributik.com', 'drsalt.net']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['İzmir', 'Ankara']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
  assert.equal(parsed.find((p) => p.id === 'drsalt').name, 'Dr.Salt');
});
