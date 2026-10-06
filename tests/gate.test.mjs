import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClaim, CLAIM_TYPES, gateClaim } from '../src/claims.mjs';

const ctx = { name: 'Corner Shop', city: 'Izmir', domain: 'shop.example', phone: '+90 232 555 01 47' };
const page = (title, body = '') => ({ status: 200, finalUrl: 'https://shop.example/', body: `<title>${title}</title>${body}` });

function io(pages) {
  return {
    async fetchPage(url, { attempt = 0 } = {}) { const p = pages[url]; return Array.isArray(p) ? p[Math.min(attempt, p.length - 1)] : (p || { status: null, error: 'ENOTFOUND' }); },
    async tlsCert() { return { error: 'timeout' }; },
    async dnsLookup() { return { a: [] }; },
    async nominatim() { return { results: [] }; },
    async search() { return { results: [] }; },
  };
}

test('every catalog type builds a claim with a proof', () => {
  for (const type of Object.keys(CLAIM_TYPES)) {
    const b = buildClaim(type, ctx);
    assert.ok(b.ok, type);
    assert.ok(b.claim.proof.length > 0, type);
    assert.ok(b.claim.statement.length > 10, type);
  }
});

test('claims outside the catalog, or without the data they need, are refused', () => {
  assert.equal(buildClaim('owner_is_rich', ctx).ok, false);
  const b = buildClaim('phone_confirmed', { ...ctx, phone: null });
  assert.equal(b.ok, false);
  assert.match(b.reason, /phone/);
});

test('gate keeps a claim whose proof holds', async () => {
  const { claim } = buildClaim('site_online', ctx);
  const g = await gateClaim(io({ 'https://shop.example/': page('Corner Shop') }), claim);
  assert.equal(g.verdict, 'verified');
  assert.ok(g.evidence.every((e) => e.matched));
});

test('gate drops “site is down” when the site loads (the classic stale-data error)', async () => {
  const { claim } = buildClaim('site_unreachable', ctx);
  const g = await gateClaim(io({ 'https://shop.example/': page('Corner Shop') }), claim);
  assert.equal(g.verdict, 'dropped');
  assert.match(g.dropReason, /expected fail, got pass/);
});

test('gate keeps “site is down” only after two failed attempts', async () => {
  const { claim } = buildClaim('site_unreachable', ctx);
  const flaky = await gateClaim(io({ 'https://shop.example/': [{ status: null, error: 'timeout' }, page('Corner Shop')] }), claim);
  assert.equal(flaky.verdict, 'dropped');
  const down = await gateClaim(io({}), claim);
  assert.equal(down.verdict, 'verified');
});

test('inconclusive evidence never verifies a claim', async () => {
  const { claim } = buildClaim('ssl_invalid', ctx); // tlsCert returns an error -> pass null
  const g = await gateClaim(io({}), claim);
  assert.equal(g.verdict, 'dropped');
  assert.match(g.dropReason, /inconclusive/);
});

test('a phone claim survives only if the number is really on the site', async () => {
  const { claim } = buildClaim('phone_confirmed', ctx);
  const yes = await gateClaim(io({ 'https://shop.example/': page('Corner Shop', 'Tel 0232 555 01 47') }), claim);
  const no = await gateClaim(io({ 'https://shop.example/': page('Corner Shop', 'Tel 0212 555 77 12') }), claim);
  assert.equal(yes.verdict, 'verified');
  assert.equal(no.verdict, 'dropped');
});
