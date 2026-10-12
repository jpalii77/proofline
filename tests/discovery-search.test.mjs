// Discovery search (12 Oct 2026, scripts/search-variants.mjs): on 12 businesses with 9 known own sites,
// "name city official website phone" with 5 results found 5 of them; the plain name (and city) with 10
// results found 8. Both are 1 Tavily credit per search.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISCOVERY_RESULTS, discoveryQuery } from '../src/checks.mjs';
import { createRealIO } from '../src/io/real.mjs';

test('discovery query: the plain name and city, no extra words', () => {
  assert.equal(discoveryQuery({ name: 'Tuba Butik' }), 'Tuba Butik');
  assert.equal(discoveryQuery({ name: 'Pet Ankara', city: 'Ankara' }), 'Pet Ankara Ankara');
  assert.equal(discoveryQuery({ name: '  Eren   Hobi ', city: null }), 'Eren Hobi');
  assert.equal(discoveryQuery({ domain: 'markapia.com' }), 'markapia.com business contact', 'a bare domain is unchanged');
});

test('live search: discovery asks for 10 results, other searches keep the client default', async () => {
  const asked = [];
  const tavily = { kind: 'tavily', async search(query, opts) { asked.push({ query, opts }); return { results: [] }; } };
  const io = createRealIO({ net: {}, tavily, fetchImpl: async () => { throw new Error('no network in tests'); } });
  await io.search('Tuba Butik', { purpose: 'discover' });
  await io.search('"Tuba Butik" permanently closed', { purpose: 'closure' });
  assert.equal(DISCOVERY_RESULTS, 10);
  assert.deepEqual(asked[0].opts, { maxResults: 10 });
  assert.deepEqual(asked[1].opts, {}, 'the closure check keeps 5 (the client default)');
});
