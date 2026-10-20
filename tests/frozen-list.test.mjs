// Frozen final round (recorded 20 Oct 2026, to run once at code freeze, 28 Oct): eval/businesses-10.json was
// written before the final run and its SHA-256 is kept in eval/FROZEN.md. If the list changes, this test fails.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { intake } from '../src/agent/pipeline.mjs';

const listDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval');
const FROZEN = 'businesses-10.json';
const raw = readFileSync(join(listDir, FROZEN));
const load = (f) => JSON.parse(readFileSync(join(listDir, f), 'utf8'));
const key = (q) => intake(q).name.toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g, '');
const earlier = readdirSync(listDir).filter((f) => /^businesses(-\d+)?\.json$/.test(f) && f !== FROZEN).sort();

test('frozen list: its SHA-256 matches the one recorded in FROZEN.md', () => {
  const recorded = readFileSync(join(listDir, 'FROZEN.md'), 'utf8').match(/SHA-256:\s*([0-9a-f]{64})/);
  assert.ok(recorded, 'FROZEN.md has no SHA-256 line');
  assert.equal(createHash('sha256').update(raw).digest('hex'), recorded[1]);
});

test('frozen list: 12 businesses, mixed input 2 name + domain / 2 name + city / 8 name only', () => {
  const items = load(FROZEN);
  assert.equal(items.length, 12);
  const parsed = items.map((it) => ({ id: it.id, ...intake(it.query) }));
  assert.deepEqual(parsed.filter((p) => p.domain).map((p) => p.domain), ['kirmizibeyazcanta.com.tr', 'mardinsabunum.com']);
  assert.deepEqual(parsed.filter((p) => p.city && !p.domain).map((p) => p.city), ['Antalya', 'Kütahya']);
  assert.equal(parsed.filter((p) => !p.city && !p.domain).length, 8);
});

test('frozen list: no id and no business shared with an earlier list', () => {
  assert.ok(earlier.length >= 9, `found ${earlier.join(', ')}`);
  const items = load(FROZEN);
  const seenIds = new Set(earlier.flatMap((f) => load(f).map((it) => it.id)));
  const seenKeys = new Set(earlier.flatMap((f) => load(f).map((it) => key(it.query))));
  for (const it of items) {
    assert.ok(!seenIds.has(it.id), `id ${it.id} was used before`);
    assert.ok(!seenKeys.has(key(it.query)), `${it.query} was already measured`);
  }
});
