// Relocation signal in the closure check (21 Oct 2026): a business that moved shows up as "permanently closed"
// for its old address. When the same search result also says it moved, that is not a closure.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCheck } from '../src/checks.mjs';

const searchIO = (results) => ({ async search() { return { results }; } });
const one = (content, title = 'Lahza Butik') => searchIO([{ url: 'https://maps.example/lahza', title, content }]);
const check = (io) => runCheck(io, 'web.no_closure_signal', { name: 'Lahza Butik', city: 'İzmir' });

test('closed + moved in the same result is not settled, and the moved hit is kept', async () => {
  const r = await check(one('Lahza Butik - Permanently closed. We moved to our new location on Kıbrıs Şehitleri Cd.'));
  assert.equal(r.pass, null, r.summary);
  assert.match(r.summary, /^Not settled: “Permanently closed” on https:\/\/maps\.example\/lahza, but the same result says the business moved \(“We moved”\)$/);
  assert.equal(r.observed.moved.length, 1);
  assert.equal(r.observed.moved[0].moved, 'We moved');
  assert.equal(r.observed.hits.length, 0);
});

test('a pure closure hit still fails as before', async () => {
  const r = await check(one('Lahza Butik permanently closed in 2025.'));
  assert.equal(r.pass, false, r.summary);
  assert.match(r.summary, /^Closure signal: “permanently closed”/);
});

test('a relocation phrase alone changes nothing', async () => {
  for (const content of ['Lahza Butik taşındı, yeni adresimiz Alsancak', 'Lahza Butik has moved to Bornova']) {
    const r = await check(one(content));
    assert.equal(r.pass, true, `${content}: ${r.summary}`);
  }
});

test('"removed" and "taşınmaz" are not relocation words', async () => {
  for (const content of ['Lahza Butik permanently closed; listing removed', 'Lahza Butik kapandı, taşınmaz satışa çıktı']) {
    const r = await check(one(content));
    assert.equal(r.pass, false, `${content}: ${r.summary}`);
    assert.equal(r.observed.moved?.length ?? 0, 0, content);
  }
});

test('Turkish relocation words in any case count', async () => {
  for (const [content, moved] of [
    ['LAHZA BUTİK KAPANDI. TAŞINDIK!', 'TAŞINDIK'],
    ['Lahza Butik kapandı. Yeni adresimiz: Alsancak', 'Yeni adresimiz'],
    ['LAHZA BUTİK KALICI OLARAK KAPANDI, YENİ ADRESİNDE HİZMETTE', 'YENİ ADRESİNDE'],
    ['Lahza Butik kapandı, yeni yerimiz Karşıyaka', 'yeni yerimiz'],
  ]) {
    const r = await check(one(content));
    assert.equal(r.pass, null, `${content}: ${r.summary}`);
    assert.equal(r.observed.moved[0].moved, moved, content);
  }
});

test('one moved hit and one pure closure hit still fail on the pure one', async () => {
  const r = await check(searchIO([
    { url: 'https://maps.example/old', title: 'Lahza Butik', content: 'Permanently closed. Relocated to Bornova.' },
    { url: 'https://news.example/', title: 'Lahza Butik', content: 'Lahza Butik closed for good last year.' },
  ]));
  assert.equal(r.pass, false, r.summary);
  assert.match(r.summary, /^Closure signal: “closed for good” on https:\/\/news\.example\//);
  assert.equal(r.observed.hits.length, 1);
  assert.equal(r.observed.moved.length, 1);
});
