// Round-1 accuracy errors (docs/accuracy.md): absence read from a cut-off page, and contact details
// shown as plain text. A cut-off page can prove presence, never absence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';
import { readCapped } from '../src/io/real.mjs';

const U = 'https://shop.example/';
const html = (body) => `<html><head><title>Shop</title></head><body>${body}</body></html>`;
const io = (page) => ({ async fetchPage() { return { status: 200, chain: [], ...page }; } });

function streamOf(chunks) {
  const enc = new TextEncoder();
  return { body: new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } }) };
}

test('readCapped flags a body longer than the limit and keeps a short one whole', async () => {
  const long = await readCapped(streamOf(['a'.repeat(60), 'b'.repeat(60)]), 100);
  assert.equal(long.truncated, true);
  assert.equal(long.text.length, 100);
  const short = await readCapped(streamOf(['<p>hi</p>']), 100);
  assert.deepEqual(short, { text: '<p>hi</p>', truncated: false });
  assert.deepEqual(await readCapped({ body: null }), { text: '', truncated: false });
});

test('contact path: nothing found on a cut-off page is "not checked", not "no contact path"', async () => {
  const r = await runCheck(io({ body: html('<p>Products</p>'), truncated: true }), 'page.contact_path', { url: U });
  assert.equal(r.pass, null);
  assert.equal(r.observed.truncated, true);
  const whole = await runCheck(io({ body: html('<p>Products</p>') }), 'page.contact_path', { url: U });
  assert.equal(whole.pass, false);
});

test('contact path: what is found on a cut-off page still counts', async () => {
  const r = await runCheck(io({ body: html('<a href="tel:+902125550000">Call</a>'), truncated: true }), 'page.contact_path', { url: U });
  assert.equal(r.pass, true);
});

test('phone and name: a miss on a cut-off page is "not checked"', async () => {
  const phone = await runCheck(io({ body: html('<p>Hello</p>'), truncated: true }), 'page.phone_listed', { url: U, phone: '+90 212 555 30 61' });
  assert.equal(phone.pass, null);
  const name = await runCheck(io({ body: html('<p>Hello</p>'), truncated: true }), 'page.name_match', { url: U, name: 'Elle Butik' });
  assert.equal(name.pass, null);
  const found = await runCheck(io({ body: html('<p>Tel: 0212 555 30 61</p>'), truncated: true }), 'page.phone_listed', { url: U, phone: '+90 212 555 30 61' });
  assert.equal(found.pass, true);
});

test('contact path: a plain-text email address counts', async () => {
  const r = await runCheck(io({ body: html('<footer>Bize yazın: info@elle-butik.com.tr</footer>') }), 'page.contact_path', { url: U });
  assert.equal(r.pass, true);
  assert.equal(r.observed.email, true);
});

test('contact path: a labelled phone number counts, in Turkish or English', async () => {
  for (const body of ['<footer>Tel: 0212 555 30 61</footer>', '<p>İletişim: +90 (532) 555 30 61</p>', '<p>Call 0232 555 01 47</p>']) {
    const r = await runCheck(io({ body: html(body) }), 'page.contact_path', { url: U });
    assert.equal(r.pass, true, body);
    assert.equal(r.observed.phone, true, body);
  }
});

test('contact path: bare numbers such as prices or order codes are not a phone', async () => {
  const r = await runCheck(io({ body: html('<p>Sipariş no 2024100812345 · Fiyat 1.299,90 TL · Stok kodu 8690000123456 · Kapıda nakit para 5325553061</p>') }), 'page.contact_path', { url: U });
  assert.equal(r.pass, false);
  assert.equal(r.observed.phone, false);
});
