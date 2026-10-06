// End to end in SAMPLE_MODE: the whole agent, then the HTTP server with its SSE stream.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { createSampleIO, findSample, loadSamples } from '../src/io/sample.mjs';
import { readConfig } from '../src/runtime.mjs';
import { createServer } from '../server.mjs';

const samples = loadSamples();

async function run(id) {
  const s = samples.find((x) => x.id === id);
  const events = [];
  const out = await runAgent({ query: s.input, io: createSampleIO(s), brain: createSampleBrain(s), emit: (e) => events.push(e) });
  return { ...out, events, sample: s };
}

test('four fictional samples are bundled and findable by name, domain or id', () => {
  assert.equal(samples.length, 4);
  assert.equal(findSample(samples, 'Kuzey Kafe')?.id, 'kuzey');
  assert.equal(findSample(samples, 'lumen coffee')?.id, 'lumen');
  assert.equal(findSample(samples, 'harbordental.example')?.id, 'harbor');
  assert.equal(findSample(samples, 'atlas')?.id, 'atlas');
  assert.equal(findSample(samples, 'some real business'), null);
  for (const s of samples) assert.match(s.domain, /\.example$/, 'sample domains must be reserved .example names');
});

test('every planted wrong claim is dropped by the gate', async () => {
  for (const s of samples) {
    const { report } = await run(s.id);
    const droppedTypes = report.dropped.map((d) => d.type);
    for (const p of s.planted) assert.ok(droppedTypes.includes(p.type), `${s.id}: planted ${p.type} should be dropped`);
    for (const v of report.verified) assert.ok(v.evidence.every((e) => e.matched), `${s.id}: ${v.type} verified without matching proof`);
  }
});

test('Lumen: certificate about to expire, no contact path, phone confirmed', async () => {
  const { report } = await run('lumen');
  const types = report.verified.map((c) => c.type).sort();
  assert.deepEqual(types, ['no_contact_path', 'on_map', 'phone_confirmed', 'site_online', 'ssl_expiring_soon']);
  assert.equal(report.card.areas.reach.grade, 'A');
  assert.equal(report.card.areas.contact.grade, 'C');
});

test('Harbor: parked domain, listed phone not on site', async () => {
  const { report } = await run('harbor');
  const types = report.verified.map((c) => c.type);
  assert.ok(types.includes('domain_parked'));
  assert.ok(types.includes('phone_unconfirmed'));
  assert.equal(report.card.areas.reach.grade, 'F');
});

test('Atlas: renamed, closure signal, one timeout does not make the site "down"', async () => {
  const { report, events } = await run('atlas');
  const types = report.verified.map((c) => c.type);
  for (const t of ['site_online', 'possibly_renamed', 'possibly_closed', 'no_https_redirect', 'phone_unconfirmed']) assert.ok(types.includes(t), t);
  assert.ok(!types.includes('site_unreachable'));
  const reach = events.find((e) => e.type === 'observe' && e.check === 'http.reachable');
  assert.equal(reach.pass, true);
});

test('Kuzey: a QR-menu platform is not the café’s website; site claims are dropped, “no own website” is kept', async () => {
  const { report } = await run('kuzey');
  assert.equal(report.ctx.ownSite, false);
  assert.deepEqual(report.verified.map((c) => c.type).sort(), ['no_own_website', 'on_map']);
  for (const d of report.dropped) assert.match(d.dropReason, /qrmenu\.example is a listing platform/, d.type);
  assert.equal(report.card.areas.reach.grade, 'D');
});

test('pitch keeps only findings that cite verified claims', async () => {
  for (const s of samples) {
    const { report } = await run(s.id);
    const ids = new Set(report.verified.map((c) => c.id));
    assert.ok(report.pitch.findings.length > 0, s.id);
    for (const f of report.pitch.findings) assert.ok(f.cites.length && f.cites.every((c) => ids.has(c)), `${s.id}: ${f.text}`);
    assert.ok(report.pitchRemoved.some((r) => /40%/.test(r.text)), `${s.id}: the uncited 40% sentence must be removed`);
  }
});

test('trace covers every stage in order', async () => {
  const { events } = await run('lumen');
  const order = ['start', 'intake', 'discover', 'plan', 'observe', 'propose', 'gate', 'verify', 'write', 'done'];
  const firsts = order.map((t) => events.findIndex((e) => e.type === t));
  assert.ok(firsts.every((i) => i >= 0), `missing stage: ${order[firsts.indexOf(-1)]}`);
  assert.deepEqual([...firsts].sort((a, b) => a - b), firsts);
});

test('HTTP server streams the run over SSE and re-runs a proof on demand', async () => {
  const cfg = { ...readConfig({ SAMPLE_MODE: 'true' }), port: 0 };
  const server = createServer(cfg).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const conf = await fetch(`${base}/api/config`).then((r) => r.json());
    assert.equal(conf.sampleMode, true);
    assert.equal(conf.samples.length, 4);
    assert.ok(!JSON.stringify(conf).match(/key/i), 'config must not mention keys');

    const sse = await fetch(`${base}/api/run?q=${encodeURIComponent('Harbor Dental Studio')}`).then((r) => r.text());
    const events = sse.trim().split('\n\n').map((chunk) => JSON.parse(chunk.split('\n').find((l) => l.startsWith('data: ')).slice(6)));
    const runId = events.find((e) => e.type === 'run').runId;
    const done = events.find((e) => e.type === 'done');
    assert.ok(done, 'stream ends with done');
    const parked = done.report.verified.find((c) => c.type === 'domain_parked');

    const again = await fetch(`${base}/api/recheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, claimId: parked.id }) }).then((r) => r.json());
    assert.equal(again.verdict, 'verified');
    assert.ok(again.evidence.length >= 2);

    const unknown = await fetch(`${base}/api/run?q=${encodeURIComponent('Unknown Bakery')}`).then((r) => r.text());
    assert.match(unknown, /event: error/);

    assert.equal((await fetch(`${base}/../../etc/passwd`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 200);
  } finally {
    server.close();
  }
});
