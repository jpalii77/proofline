// Audit of 15 Oct 2026, findings 7-9 (the next three after audit-1015.test.mjs):
// 7) a site that turns automated visits away (403, 429, 503) or a failing DNS service was reported as "does not load"
// 8) Turkish phrases starting or ending in a Turkish letter ("Çok yakında", "kapandı.") never matched,
//    because \b only knows ASCII letters
// 9) a model answer naming "constructor" (or any built-in object key) as a claim type crashed the run
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClaim } from '../src/claims.mjs';
import { runCheck } from '../src/checks.mjs';

// 7 ─────────────────────────────────────────────────────────────────────────────────────────────

const pageIO = (answers) => {
  let i = 0;
  return { async fetchPage() { return answers[Math.min(i++, answers.length - 1)]; } };
};

test('a site that answers 403, 429 or 503 is "not checked", never "does not load"', async () => {
  for (const status of [401, 403, 429, 503]) {
    const r = await runCheck(pageIO([{ status, body: '' }]), 'http.reachable', { url: 'https://shop.example/' });
    assert.equal(r.pass, null, `${status}: ${r.summary}`);
    assert.match(r.summary, new RegExp(`HTTP ${status}`));
  }
});

test('one timeout and one 403 is still "not checked"', async () => {
  const r = await runCheck(pageIO([{ status: null, error: 'timeout' }, { status: 403, body: '' }]), 'http.reachable', { url: 'https://shop.example/' });
  assert.equal(r.pass, null, r.summary);
});

test('a failing DNS service on our side is "not checked"', async () => {
  for (const error of ['EAI_AGAIN', 'DoH HTTP 502', 'DNS status 2']) {
    const r = await runCheck(pageIO([{ status: null, error }]), 'http.reachable', { url: 'https://shop.example/' });
    assert.equal(r.pass, null, `${error}: ${r.summary}`);
  }
});

test('real failures still count as "does not load"', async () => {
  for (const a of [{ status: 404, body: '' }, { status: 500, body: '' }, { status: 502, body: '' }, { status: null, error: 'ENOTFOUND' }, { status: null, error: 'ECONNREFUSED' }, { status: null, error: 'timeout' }]) {
    const r = await runCheck(pageIO([a]), 'http.reachable', { url: 'https://shop.example/' });
    assert.equal(r.pass, false, `${a.status ?? a.error}: ${r.summary}`);
  }
});

test('a 403 on the second try after a 200 on the first is still a loaded site', async () => {
  const r = await runCheck(pageIO([{ status: 200, body: '<title>x</title>' }]), 'http.reachable', { url: 'https://shop.example/' });
  assert.equal(r.pass, true, r.summary);
});

// 8 ─────────────────────────────────────────────────────────────────────────────────────────────

const htmlIO = (html) => ({ async fetchPage() { return { status: 200, body: html }; } });

test('Turkish placeholder phrases are caught whatever letter they start or end with', async () => {
  for (const t of ['Çok yakında', 'ÇOK YAKINDA', 'Sitemiz çok yakında!', 'Cok yakinda', 'Satılık alan adı', 'YAKINDA AÇILACAK', 'Yapım aşamasında']) {
    const r = await runCheck(htmlIO(`<html><head><title>${t}</title></head><body><p>${t}</p></body></html>`), 'page.not_parked', { url: 'https://shop.example/' });
    assert.equal(r.pass, false, `${t}: ${r.summary}`);
  }
});

test('a Turkish word that only contains a placeholder phrase does not count', async () => {
  const body = '<html><head><title>Bitki Dükkânı</title></head><body><h1>Bitki Dükkânı</h1><p>Yeni sezon ürünlerimiz mağazada. Sipariş ve iletişim için bize yazın. Kargo ücretsiz.</p></body></html>';
  const r = await runCheck(htmlIO(body), 'page.not_parked', { url: 'https://shop.example/' });
  assert.equal(r.pass, true, r.summary);
});

const searchIO = (results) => ({ async search() { return { results }; } });

test('"kapandı." and "kapandı," at the end of a sentence are closure signals', async () => {
  for (const content of ['Lahza Butik kapandı.', 'Lahza Butik kapandı, yerine kafe açıldı', 'LAHZA BUTİK KAPANDI', 'Lahza Butik kalıcı olarak kapandı']) {
    const r = await runCheck(searchIO([{ url: 'https://news.example/', title: 'Lahza Butik', content }]), 'web.no_closure_signal', { name: 'Lahza Butik' });
    assert.equal(r.pass, false, `${content}: ${r.summary}`);
  }
});

test('"kapandığı" or "kapandıktan" inside a longer word is not a closure signal', async () => {
  for (const content of ['Lahza Butik kapandıktan sonra açılan dükkân değil', 'Lahza Butik: kampanyanın kapandığı gün']) {
    const r = await runCheck(searchIO([{ url: 'https://news.example/', title: 'Lahza Butik', content }]), 'web.no_closure_signal', { name: 'Lahza Butik' });
    assert.equal(r.pass, true, `${content}: ${r.summary}`);
  }
});

// 9 ─────────────────────────────────────────────────────────────────────────────────────────────

test('a built-in object key as claim type is refused, not a crash', () => {
  for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const r = buildClaim(type, { domain: 'shop.example', name: 'Shop', city: 'Ankara' });
    assert.equal(r.ok, false, type);
    assert.match(r.reason, /not in the claim catalog/);
  }
});

test('a built-in object key as check id is "unknown check", not a crash', async () => {
  for (const id of ['constructor', 'toString', '__proto__']) {
    const r = await runCheck({}, id, {});
    assert.equal(r.pass, null, id);
    assert.match(r.summary, /Unknown check/);
  }
});
