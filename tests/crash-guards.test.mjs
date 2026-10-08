// Crash tests: odd input, broken services and odd requests must never take the server down or show
// a stack trace. Services that fail turn into "not checked" / "did not answer", never into findings.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import { test } from 'node:test';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleIO, findSample, loadSamples } from '../src/io/sample.mjs';
import { readConfig } from '../src/runtime.mjs';
import { createWebApp } from '../src/web/app.mjs';
import { createMemoryStore } from '../src/web/store.mjs';
import { createServer } from '../server.mjs';
import { DICT, partialText, setLang } from '../public/i18n.js';

const samples = loadSamples();
const parse = (text) => text.split('\n\n').filter(Boolean).map((block) => ({ type: /^event: (.*)$/m.exec(block)?.[1], ...JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || '{}') }));

async function local(fn) {
  const server = createServer(readConfig({ SAMPLE_MODE: 'true' }));
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  try { return await fn(`http://127.0.0.1:${port}`, port); } finally { server.close(); }
}

/** Sends a raw HTTP request (so the request line can be malformed) and returns the status line. */
function raw(port, text) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(text));
    let out = '';
    const timer = setTimeout(() => { s.destroy(); resolve(out.split('\r\n')[0] || 'no answer'); }, 2000);
    s.on('data', (d) => { out += d; });
    s.on('close', () => { clearTimeout(timer); resolve(out.split('\r\n')[0] || 'no answer'); });
    s.on('error', () => {});
  });
}

test('local server: a malformed address gets 400, not an unhandled rejection, and the server keeps answering', async () => {
  const rejections = [];
  const onRejection = (e) => rejections.push(e);
  process.on('unhandledRejection', onRejection);
  try {
    await local(async (base, port) => {
      for (const target of ['http://[', '//[/']) {
        const line = await raw(port, `GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
        assert.match(line, / 400 /, `${target} -> ${line}`);
      }
      assert.equal((await fetch(`${base}/api/config`)).status, 200);
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(rejections.map(String), []);
  } finally { process.off('unhandledRejection', onRejection); }
});

test('local server: a re-check body that is not an object is a 400, at any size or content type', async () => {
  await local(async (base) => {
    for (const body of ['null', '[]', '"x"', '42', 'x'.repeat(3_000_000), '{"runId":']) {
      const res = await fetch(`${base}/api/recheck`, { method: 'POST', body, headers: { 'content-type': 'text/plain' } });
      assert.equal(res.status, 400, `body ${body.slice(0, 12)} -> ${res.status}`);
      assert.ok((await res.json()).error);
    }
    const res = await fetch(`${base}/api/recheck`, { method: 'POST', body: '{"runId":"nope","claimId":"x"}' });
    assert.equal(res.status, 404, 'a well-formed but unknown run is "expired"');
  });
});

test('demo app: a re-check body that is not an object is a 400', async () => {
  const app = createWebApp({ env: {}, store: createMemoryStore(), pace: false });
  for (const body of ['null', '[]', '"x"', '7']) {
    const res = await app(new Request('https://demo.test/api/recheck', { method: 'POST', body }));
    assert.equal(res.status, 400, `body ${body}`);
  }
});

test('local server: a query of only spaces asks for a name instead of saying "unknown business"', async () => {
  await local(async (base) => {
    for (const q of ['', '%20%20%20', '%09%0A']) {
      const ev = parse(await (await fetch(`${base}/api/run?q=${q}`)).text());
      assert.deepEqual(ev.map((e) => e.type), ['error']);
      assert.equal(ev[0].message, 'Enter a business name or a domain.');
    }
  });
});

test('recorded mode: one or two letters do not open a random example; real partial names still do', () => {
  for (const q of ['a', 'e', 'ka', 'z ', '☕️', '<script>', "'; DROP TABLE x; --"]) assert.equal(findSample(samples, q), null, `“${q}” matched a sample`);
  assert.equal(findSample(samples, 'lumen')?.id, 'lumen');
  assert.equal(findSample(samples, 'Kuzey Kafe')?.id, 'kuzey');
  assert.equal(findSample(samples, '☕️ kuzey kafe 🎉')?.id, 'kuzey', 'emoji around a name is ignored');
  assert.equal(findSample(samples, 'https://lumencoffee.example/')?.id, 'lumen');
  assert.equal(findSample(samples, 'ATLAS BİKE REPAİR, BEŞİKTAŞ')?.id, 'atlas', 'Turkish capitals fold');
  assert.equal(findSample(samples, 'x'.repeat(600)), null);
});

test('local server: odd input never breaks the stream (HTML, SQL, emoji, 600 characters, Turkish letters)', async () => {
  await local(async (base) => {
    for (const q of ['<script>alert(1)</script>', "'; DROP TABLE users; --", '🍕🍕', 'x'.repeat(600), 'İstanbul Işık Şekerci Ğ', 'https://unknown.example']) {
      const res = await fetch(`${base}/api/run?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200);
      const ev = parse(await res.text());
      assert.equal(ev.at(-1).type, 'error', q);
      assert.ok(!/<script>/.test(ev.at(-1).message), 'input is never echoed back as markup');
    }
  });
});

test('local server: /r, /r/ and unknown share ids get the page with a 404, never a bare "Not found"', async () => {
  await local(async (base) => {
    for (const p of ['/r', '/r/', '/r/olmayan', '/r/aaaaaaaaaaaa', '/r/%3Cscript%3E']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 404, p);
      assert.match(res.headers.get('content-type'), /text\/html/, p);
      assert.match(await res.text(), /<main>/, p);
    }
  });
});

test('local server: five runs at once all finish', async () => {
  await local(async (base) => {
    const qs = ['lumen', 'harbor', 'atlas', 'kuzey', 'lumen'];
    const out = await Promise.all(qs.map((q) => fetch(`${base}/api/run?q=${q}`).then((r) => r.text())));
    for (const [i, text] of out.entries()) assert.ok(parse(text).some((e) => e.type === 'done'), qs[i]);
  });
});

test('local server: a visitor who leaves mid-run (reload, back) does not crash it', async () => {
  const server = createServer(readConfig({ SAMPLE_MODE: 'true' }), { pace: true });
  server.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ac = new AbortController();
    const res = await fetch(`${base}/api/run?q=lumen`, { signal: ac.signal });
    await res.body.getReader().read();
    ac.abort();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await fetch(`${base}/api/config`)).status, 200);
  } finally { server.close(); server.closeAllConnections?.(); }
});

// ---- live services failing, with a fake network (no keys, no real calls) ----------------------

const KEYS = { NEBIUS_API_KEY: 'test-nebius-not-real', TAVILY_API_KEY: 'test-tavily-not-real', LIVE_RUN_SECONDS: '20' };
const J = (b, status = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const FAIL = {
  timeout: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
  401: () => J('unauthorized', 401),
  429: () => J('slow down', 429),
  500: () => J('upstream', 500),
  badJson: () => new Response('{not json', { status: 200 }),
  empty: () => new Response('', { status: 200 }),
};

function fakeNet({ nebius, tavily, dns }) {
  return async (url) => {
    const u = String(url);
    if (u.includes('tokenfactory')) return nebius ? FAIL[nebius]() : J({ choices: [{ message: { content: '{}' } }] });
    if (u.includes('tavily')) return tavily ? FAIL[tavily]() : J({ results: [{ title: 'Corner Shop Izmir', url: 'https://cornershop.example.com/', content: 'Corner Shop, Izmir' }] });
    if (u.includes('dns-query')) {
      if (dns === 'down') throw new TypeError('fetch failed');
      if (dns === 'nxdomain') return J({ Status: 3 });
      return J({ Status: 0, Answer: [{ type: 1, data: '93.184.215.14' }] });
    }
    if (u.includes('certspotter') || u.includes('nominatim')) return J([]);
    return new Response('<html><title>Corner Shop</title>Corner Shop Izmir</html>', { headers: { 'content-type': 'text/html' } });
  };
}

async function liveRun(failure) {
  const app = createWebApp({ env: KEYS, store: createMemoryStore(), pace: false, fetchImpl: fakeNet(failure) });
  const res = await app(new Request('https://demo.test/api/run?live=1&q=cornershop.example.com', { headers: { 'cf-connecting-ip': '198.51.100.20' } }));
  return parse(await res.text());
}

for (const [service, modes] of [['nebius', Object.keys(FAIL)], ['tavily', Object.keys(FAIL)], ['dns', ['down', 'nxdomain']]]) {
  for (const mode of modes) {
    test(`live run with ${service} ${mode}: finishes with a report, nothing unproven, the gap is named`, async () => {
      const ev = await liveRun({ [service]: mode });
      assert.ok(!ev.some((e) => e.type === 'error'), 'no error event');
      const report = ev.find((e) => e.type === 'done')?.report;
      assert.ok(report, 'a report');
      for (const c of report.verified) assert.ok(c.evidence.every((e) => e.matched), `${c.type} is proven`);
      if (service === 'dns') assert.ok(report.stats.notChecked > 0, 'checks that could not run are “not checked”');
      else assert.ok(report.partial.length > 0, 'the failed step is listed as partial');
      for (const p of report.partial) assert.ok(!/ at .*\.mjs|\n/.test(p), 'no stack trace');
    });
  }
}

// ---- what the page shows for a partial run, in both languages -----------------------------------

test('partial-run notes from the agent are shown in Turkish, with a plain reason', async () => {
  const lumen = samples.find((s) => s.id === 'lumen');
  const fail = (msg) => async () => { throw Object.assign(new Error(msg), { call: { model: 'm', ms: 1, usage: null } }); };
  const brain = { ...createSampleBrain(lumen), plan: fail('Token Factory HTTP 401: nope'), propose: fail('Token Factory: no answer within 60 s'), verify: fail('Token Factory reply was not JSON'), write: fail('Token Factory HTTP 429: busy') };
  const io = { ...createSampleIO(lumen), search: async () => ({ error: 'Tavily HTTP 500' }) };
  const { report } = await runAgent({ query: lumen.input, io, brain });
  assert.equal(report.partial.length, 4, 'search, planner, proposer and writer (rewrite has nothing left to do)');
  try {
    setLang('tr');
    for (const p of report.partial) {
      const shown = partialText(p);
      assert.notEqual(shown, p, `Turkish text for: ${p}`);
      assert.ok(!/did not answer|failed \(/.test(shown), shown);
    }
    assert.match(partialText(report.partial.find((p) => p.startsWith('Planner'))), /erişim reddedildi/);
    assert.match(partialText(report.partial.find((p) => p.startsWith('Claim proposer'))), /zaman aşımı/);
    assert.equal(partialText('Something new.'), 'Something new.', 'unknown notes are shown as sent');
    setLang('en');
    for (const p of report.partial) assert.equal(partialText(p).split(' (')[0], p.split(' (')[0], 'English keeps the agent’s sentence');
    assert.match(partialText('Planner did not answer (Cannot read properties of null (reading \'usage\')); code used the query and the search results instead.'), /\(unreadable answer\)/, 'no raw JavaScript error text');
  } finally { setLang('en'); }
  assert.ok(DICT.tr['partial.planner']);
});
