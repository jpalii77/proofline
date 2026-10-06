import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';
import { isPrivateAddress } from '../src/io/real.mjs';
import { extractPhones, fold, nameSimilarity, normalizeHost, phoneKey } from '../src/text.mjs';

const html = (title, body = '') => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

// Minimal fake I/O: pages keyed by URL, optionally a list of attempts.
function fakeIO({ pages = {}, dns = {}, tls = {}, osm = { results: [] }, search = {} } = {}) {
  return {
    async dnsLookup(h) { return dns[h] || { a: [], aaaa: [], error: 'ENOTFOUND' }; },
    async fetchPage(url, { attempt = 0 } = {}) {
      const p = pages[url];
      if (!p) return { status: null, error: 'ENOTFOUND', chain: [] };
      return Array.isArray(p) ? p[Math.min(attempt, p.length - 1)] : p;
    },
    async tlsCert(h) { return tls[h] || { error: 'ECONNREFUSED' }; },
    async nominatim() { return osm; },
    async search(q, { purpose } = {}) { return search[purpose] || { results: [] }; },
  };
}

const U = 'https://shop.example/';
const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

test('text helpers fold Turkish, compare names, normalise phones and hosts', () => {
  assert.equal(fold('Kadıköy Şişli ĞÜÇ'), 'kadikoy sisli guc');
  assert.equal(nameSimilarity('Lumen Coffee Roasters', 'LUMEN coffee roasters'), 1);
  assert.ok(nameSimilarity('Atlas Bike Repair', 'Velo Atölye') < 0.2);
  assert.equal(phoneKey('+90 (232) 555 01 47'), phoneKey('0232 555 01 47'));
  assert.deepEqual(extractPhones('Call 0212 555 77 12 today'), ['2125557712']);
  assert.equal(normalizeHost('https://WWW.Shop.example/path'), 'shop.example');
  assert.equal(normalizeHost('not a domain'), null);
});

test('dns.resolves passes with records and fails on NXDOMAIN', async () => {
  const io = fakeIO({ dns: { 'shop.example': { a: ['192.0.2.1'], aaaa: [] } } });
  assert.equal((await runCheck(io, 'dns.resolves', { host: 'shop.example' })).pass, true);
  assert.equal((await runCheck(io, 'dns.resolves', { host: 'gone.example' })).pass, false);
});

test('http.reachable retries once before calling a site down', async () => {
  const io = fakeIO({ pages: { [U]: [{ status: null, error: 'timeout' }, { status: 200, finalUrl: U, body: html('Shop') }] } });
  const r = await runCheck(io, 'http.reachable', { url: U });
  assert.equal(r.pass, true);
  assert.equal(r.observed.attempts.length, 2);
  const down = await runCheck(fakeIO(), 'http.reachable', { url: U });
  assert.equal(down.pass, false);
});

test('http.https_redirect sees whether plain HTTP upgrades', async () => {
  const up = fakeIO({ pages: { 'http://shop.example/': { status: 200, finalUrl: U, chain: [] } } });
  assert.equal((await runCheck(up, 'http.https_redirect', { host: 'shop.example' })).pass, true);
  const stay = fakeIO({ pages: { 'http://shop.example/': { status: 200, finalUrl: 'http://shop.example/', chain: [] } } });
  assert.equal((await runCheck(stay, 'http.https_redirect', { host: 'shop.example' })).pass, false);
});

test('tls.cert_valid measures days left and is inconclusive on handshake errors', async () => {
  const io = fakeIO({ tls: { 'shop.example': { validTo: days(9), authorized: true } } });
  assert.equal((await runCheck(io, 'tls.cert_valid', { host: 'shop.example', minDays: 0 })).pass, true);
  const soon = await runCheck(io, 'tls.cert_valid', { host: 'shop.example', minDays: 30 });
  assert.equal(soon.pass, false);
  assert.ok(soon.observed.daysLeft >= 8 && soon.observed.daysLeft <= 9);
  const expired = fakeIO({ tls: { 'shop.example': { validTo: days(-3), authorized: false } } });
  assert.equal((await runCheck(expired, 'tls.cert_valid', { host: 'shop.example' })).pass, false);
  assert.equal((await runCheck(fakeIO(), 'tls.cert_valid', { host: 'x.example' })).pass, null);
});

test('page.not_parked spots for-sale and placeholder pages', async () => {
  const parked = fakeIO({ pages: { [U]: { status: 200, body: html('shop.example is for sale', 'Buy this domain') } } });
  assert.equal((await runCheck(parked, 'page.not_parked', { url: U })).pass, false);
  const real = fakeIO({ pages: { [U]: { status: 200, body: html('Corner Shop', 'Fresh bread daily') } } });
  assert.equal((await runCheck(real, 'page.not_parked', { url: U })).pass, true);
  assert.equal((await runCheck(fakeIO(), 'page.not_parked', { url: U })).pass, null, 'unreachable page is inconclusive, not "parked"');
});

test('page.contact_path finds forms, mailto, tel and WhatsApp links', async () => {
  const none = fakeIO({ pages: { [U]: { status: 200, body: html('Shop', '<p>Hello</p>') } } });
  assert.equal((await runCheck(none, 'page.contact_path', { url: U })).pass, false);
  const wa = fakeIO({ pages: { [U]: { status: 200, body: html('Shop', '<a href="https://wa.me/905555555555">Chat</a>') } } });
  assert.equal((await runCheck(wa, 'page.contact_path', { url: U })).pass, true);
  const form = fakeIO({ pages: { [U]: { status: 200, body: html('Shop', '<form><input type="email"><textarea></textarea></form>') } } });
  assert.equal((await runCheck(form, 'page.contact_path', { url: U })).observed.form, true);
});

test('page.phone_listed matches numbers across formats', async () => {
  const io = fakeIO({ pages: { [U]: { status: 200, body: html('Shop', 'Call <a href="tel:+902325550147">0232 555 01 47</a>') } } });
  assert.equal((await runCheck(io, 'page.phone_listed', { url: U, phone: '+90 232 555 01 47' })).pass, true);
  assert.equal((await runCheck(io, 'page.phone_listed', { url: U, phone: '+90 212 555 30 61' })).pass, false);
});

test('page.name_match compares the site name with the business name', async () => {
  const io = fakeIO({ pages: { [U]: { status: 200, body: html('Velo Atölye | Bisiklet') } } });
  assert.equal((await runCheck(io, 'page.name_match', { url: U, name: 'Atlas Bike Repair' })).pass, false);
  assert.equal((await runCheck(io, 'page.name_match', { url: U, name: 'Velo Atölye' })).pass, true);
});

test('osm.listed and web.no_closure_signal', async () => {
  const io = fakeIO({
    osm: { results: [{ name: 'Lumen Coffee Roasters', display_name: 'Lumen Coffee Roasters, İzmir' }] },
    search: { closure: { results: [{ title: 'Lumen Coffee Roasters — Permanently closed', url: 'https://x.example', content: '' }] } },
  });
  assert.equal((await runCheck(io, 'osm.listed', { name: 'Lumen Coffee Roasters', city: 'Izmir' })).pass, true);
  assert.equal((await runCheck(io, 'osm.listed', { name: 'Atlas Bike Repair' })).pass, false);
  assert.equal((await runCheck(io, 'web.no_closure_signal', { name: 'Lumen Coffee Roasters' })).pass, false);
  // A closure phrase about a different business does not count.
  assert.equal((await runCheck(io, 'web.no_closure_signal', { name: 'Harbor Dental Studio' })).pass, true);
});

test('unknown checks and crashing I/O never pass', async () => {
  assert.equal((await runCheck(fakeIO(), 'nope', {})).pass, null);
  const boom = { fetchPage: async () => { throw new Error('boom'); } };
  assert.equal((await runCheck(boom, 'page.not_parked', { url: U })).pass, null);
});

test('SSRF guard refuses private and loopback addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['93.184.216.34', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});
