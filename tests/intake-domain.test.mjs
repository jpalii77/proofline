// Accuracy round 1 (2026-10-08): "Hicret Kuruyemiş, hicretkuruyemis.net" sent the domain on as the city,
// so the map lookup searched "Hicret Kuruyemiş, hicretkuruyemis.net", found nothing, and the gate kept
// "missing from OpenStreetMap" although the shop is listed. A domain is never a city.
import test from 'node:test';
import assert from 'node:assert/strict';
import { intake } from '../src/agent/pipeline.mjs';
import { CHECKS } from '../src/checks.mjs';

test('intake: "Name, domain" keeps the domain as the website, not the city', () => {
  const p = intake('Hicret Kuruyemiş, hicretkuruyemis.net');
  assert.equal(p.name, 'Hicret Kuruyemiş');
  assert.equal(p.domain, 'hicretkuruyemis.net');
  assert.equal(p.city, null);
});

test('intake: "Name, City, domain" and "Name, domain, City" split both ways', () => {
  for (const q of ['Elle Shoes, Istanbul, elleshoes.com', 'Elle Shoes, https://www.elleshoes.com/, Istanbul']) {
    const p = intake(q);
    assert.equal(p.name, 'Elle Shoes');
    assert.equal(p.city, 'Istanbul');
    assert.equal(p.domain, 'elleshoes.com');
  }
});

test('intake: plain "Name, City" and bare domains are unchanged', () => {
  assert.deepEqual(intake('Sakal Kafe Pub, Ankara'), { raw: 'Sakal Kafe Pub, Ankara', name: 'Sakal Kafe Pub', city: 'Ankara' });
  assert.equal(intake('zekitriko.com').domain, 'zekitriko.com');
  assert.equal(intake('zekitriko.com').name, undefined);
});

test('osm.listed: a domain in the city slot is left out of the map query', async () => {
  const queries = [];
  const io = { async nominatim(q) { queries.push(q); return { results: [{ name: 'Hicret Kuruyemiş', display_name: 'Hicret Kuruyemiş, Kocaeli, Türkiye' }] }; } };
  const r = await CHECKS['osm.listed'].run(io, { name: 'Hicret Kuruyemiş', city: 'hicretkuruyemis.net' });
  assert.deepEqual(queries, ['Hicret Kuruyemiş']);
  assert.equal(r.pass, true);
});
