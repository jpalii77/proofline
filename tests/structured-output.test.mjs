// Structured output: every Nemotron call sends a JSON Schema (response_format json_schema) whose enums
// hold the model to allowed values. If Token Factory refuses the schema, the call falls back to plain
// JSON mode once, says so, and the code checks after it are unchanged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNemotronBrain, oneOfOrNull, SCHEMAS } from '../src/agent/nemotron-brain.mjs';
import { runAgent } from '../src/agent/pipeline.mjs';
import { catalogForPrompt } from '../src/claims.mjs';
import { createSampleIO, loadSamples } from '../src/io/sample.mjs';
import { createTokenFactoryClient } from '../src/llm.mjs';

const FAKE_KEY = 'test-not-a-real-key';
const lumen = loadSamples().find((s) => s.id === 'lumen');
const reply = (obj) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }), { status: 200 });

// Strict mode needs every property listed as required and no extra properties, at every level.
function assertStrict(schema, where = 'root') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${where}: additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${where}: required`);
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${where}.${k}`);
  }
  if (schema.type === 'array' && schema.items) assertStrict(schema.items, `${where}[]`);
}

test('schemas are strict and their enums hold the model to allowed values', () => {
  const plan = SCHEMAS.plan({ grounding: { domains: ['lumencoffee.example', 'menulio.com'], phones: ['+90 232 555 0101'] } });
  assertStrict(plan.schema);
  assert.deepEqual(plan.schema.properties.domain.enum, ['lumencoffee.example', 'menulio.com', null], 'domain: only one seen in the search results, or null');
  assert.deepEqual(plan.schema.properties.phone.enum, ['+90 232 555 0101', null]);

  const propose = SCHEMAS.propose({ catalog: catalogForPrompt() });
  assertStrict(propose.schema);
  assert.deepEqual(propose.schema.properties.claims.items.properties.type.enum, catalogForPrompt().map((c) => c.type), 'claim type: only from the catalog');

  const ids = [{ id: 'site_online' }, { id: 'ssl_expiring_soon' }];
  const verify = SCHEMAS.verify({ claims: ids });
  assertStrict(verify.schema);
  assert.deepEqual(verify.schema.properties.claims.items.properties.id.enum, ['site_online', 'ssl_expiring_soon']);

  const write = SCHEMAS.write({ claims: ids });
  assertStrict(write.schema);
  assert.deepEqual(write.schema.properties.pitch.properties.findings.items.properties.cites.items.enum, ['site_online', 'ssl_expiring_soon'], 'a finding can only cite a verified claim');
  assert.deepEqual(SCHEMAS.write({ claims: [] }).schema.properties.pitch.properties.findings.items.properties.cites, { type: 'array', maxItems: 0 }, 'no verified claims: nothing to cite');
});

test('an empty allowed list means null only; duplicates and blanks are dropped', () => {
  assert.deepEqual(oneOfOrNull([]), { type: 'null' });
  assert.deepEqual(oneOfOrNull(undefined), { type: 'null' });
  assert.deepEqual(oneOfOrNull(['a.com', 'a.com', '', null]), { type: ['string', 'null'], enum: ['a.com', null] });
});

test('the client sends response_format json_schema and reports the format used', async () => {
  const bodies = [];
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, fetchImpl: async (url, init) => { bodies.push(JSON.parse(init.body)); return reply({ ok: true }); } });
  const schema = { name: 'x', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } };
  const r = await llm.chat({ system: 's', user: 'u', schema });
  assert.deepEqual(bodies[0].response_format, { type: 'json_schema', json_schema: { name: 'x', schema: schema.schema, strict: true } });
  assert.equal(r.format, 'json_schema');
  assert.equal(bodies.length, 1);

  const plain = await llm.chat({ system: 's', user: 'u' });
  assert.deepEqual(bodies[1].response_format, { type: 'json_object' }, 'no schema: plain JSON mode as before');
  assert.equal(plain.format, 'json_object');
});

test('a refused schema (HTTP 400) is sent once more as plain JSON mode, and the call says so', async () => {
  const formats = [];
  const llm = createTokenFactoryClient({
    apiKey: FAKE_KEY,
    fetchImpl: async (url, init) => {
      const rf = JSON.parse(init.body).response_format;
      formats.push(rf.type);
      return rf.type === 'json_schema' ? new Response('{"detail":"response_format json_schema not supported"}', { status: 400 }) : reply({ ok: true });
    },
  });
  const r = await llm.chat({ system: 's', user: 'u', schema: { name: 'x', schema: { type: 'object' } } });
  assert.deepEqual(formats, ['json_schema', 'json_object']);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(r.format, 'json_object (schema refused)');
});

test('other errors are not retried: a 500 or 401 fails once, with the format on the error', async () => {
  for (const status of [500, 401]) {
    let n = 0;
    const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, fetchImpl: async () => { n++; return new Response('nope', { status }); } });
    const err = await llm.chat({ system: 's', user: 'u', schema: { name: 'x', schema: { type: 'object' } } }).catch((e) => e);
    assert.equal(n, 1, `HTTP ${status}: one request`);
    assert.match(err.message, new RegExp(`HTTP ${status}`));
    assert.equal(err.call.format, 'json_schema');
  }
});

test('a full live-shaped run: each call carries its schema, and the format reaches the model panel', async () => {
  const sent = {};
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const name = body.response_format.json_schema?.name;
    sent[name] = body.response_format.json_schema.schema;
    if (name === 'business_identity') return reply({ name: 'Lumen Coffee Roasters', city: 'Izmir', domain: sent[name].properties.domain.enum[0], phone: null, reasoning: 'first result' });
    if (name === 'claim_proposals') return reply({ claims: [{ type: 'site_online', rationale: 'loads' }] });
    if (name === 'owner_lines') return reply({ claims: [{ id: 'site_online', owner_text: 'Your website works.' }] });
    return reply({ owner_summary: 'Fine.', pitch: { subject: 'Hi', opening: 'Hello.', findings: [{ text: 'Your site loads.', cites: ['site_online'] }], offer: 'Help.', closing: 'Thanks.' } });
  };
  const llm = createTokenFactoryClient({ apiKey: FAKE_KEY, fetchImpl });
  const { report } = await runAgent({ query: lumen.input, io: createSampleIO(lumen), brain: createNemotronBrain(llm) });
  assert.deepEqual(Object.keys(sent).sort(), ['business_identity', 'claim_proposals', 'owner_lines', 'summary_and_pitch']);
  assert.deepEqual(report.models.calls.map((c) => c.format), ['json_schema', 'json_schema', 'json_schema', 'json_schema']);
  assert.ok(sent.owner_lines.properties.claims.items.properties.id.enum.includes('site_online'), 'verify ids are the verified claims');
  assert.ok(report.verified.some((c) => c.type === 'site_online'));
});
