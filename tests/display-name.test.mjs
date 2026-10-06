// The report card shows the business's proper name, not the raw query.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgent } from '../src/agent/pipeline.mjs';
import { createSampleBrain } from '../src/agent/sample-brain.mjs';
import { displayName } from '../src/display-name.mjs';
import { createSampleIO, findSample, loadSamples } from '../src/io/sample.mjs';

test('planner name wins when it is a real name, not the query echoed', () => {
  assert.equal(displayName({ raw: 'sakal kafe ankara', planName: 'Sakal Kafe Pub', city: 'Ankara' }), 'Sakal Kafe Pub');
  assert.equal(displayName({ raw: 'sakal kafe ankara', planName: 'Sakal Kafe Pub, Ankara', city: 'Ankara' }), 'Sakal Kafe Pub');
});

test('an echoed query falls back to a search-result title that names the business', () => {
  const results = [
    { title: 'Instagram' },
    { title: 'SAKAL KAFE PUB, Ankara - Restaurant Reviews - Tripadvisor' },
  ];
  assert.equal(displayName({ raw: 'sakal kafe ankara', planName: 'sakal kafe ankara', city: 'Ankara', results }), 'SAKAL KAFE PUB');
  const nice = [{ title: 'Sakal Kafe Pub | Çankaya, Ankara' }];
  assert.equal(displayName({ raw: 'sakal kafe ankara', planName: 'Sakal Kafe Ankara', city: null, results: nice }), 'Sakal Kafe Pub');
});

test('without a better source: the query minus the city, title-cased', () => {
  assert.equal(displayName({ raw: 'sakal kafe ankara' }), 'Sakal Kafe');
  assert.equal(displayName({ raw: 'kuzey kafe', city: 'izmir' }), 'Kuzey Kafe');
  assert.equal(displayName({ raw: 'corner bakery', city: 'Lisbon' }), 'Corner Bakery');
  assert.equal(displayName({ raw: 'ankara' }), 'Ankara', 'never strips the whole name');
});

test('the report card carries a display name in every sample', async () => {
  for (const s of loadSamples()) {
    const sample = findSample(loadSamples(), s.input);
    const out = await runAgent({ query: s.input, io: createSampleIO(sample), brain: createSampleBrain(sample) });
    assert.equal(out.report.ctx.displayName, s.name, s.id);
  }
});

test('a lowercase "name city" query gets a proper card title in the pipeline', async () => {
  const sample = loadSamples().find((s) => s.id === 'lumen');
  const brain = { ...createSampleBrain(sample) };
  const plan = brain.plan;
  brain.plan = async (args) => { const r = await plan(args); return { ...r, json: { ...r.json, name: 'lumen coffee roasters izmir', city: null } }; };
  const out = await runAgent({ query: 'lumen coffee roasters izmir', io: createSampleIO(sample), brain });
  assert.equal(out.report.ctx.displayName, 'Lumen Coffee Roasters');
});
