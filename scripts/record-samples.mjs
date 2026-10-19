// Records real NVIDIA Nemotron answers (Nebius Token Factory) for the four fictional examples, in
// English and Turkish, into fixtures/recorded/. The public demo then replays them: real model text,
// tokens and latency, labelled "recorded on <date>", at no cost per visit.
//   NEBIUS_API_KEY=... NEBIUS_FAST_MODEL=... node scripts/record-samples.mjs [sample-id ...]
// 7 calls per example (plan once, then propose, rewrite, write in each language). No Tavily: the
// examples' web data is recorded too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeRecording, recordSample } from '../src/agent/recorder.mjs';
import { createTokenFactoryClient, DEFAULT_REASONING_MODEL } from '../src/llm.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = path.join(root, 'fixtures', 'sample');
const outDir = path.join(root, 'fixtures', 'recorded');

const llm = createTokenFactoryClient({
  apiKey: process.env.NEBIUS_API_KEY,
  baseUrl: process.env.NEBIUS_BASE_URL || undefined,
  reasoningModel: process.env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL,
  fastModel: process.env.NEBIUS_FAST_MODEL,
});

const only = process.argv.slice(2);
const files = fs.readdirSync(sampleDir).filter((f) => f.endsWith('.json')).sort();
let total = 0;
for (const file of files) {
  const sample = JSON.parse(fs.readFileSync(path.join(sampleDir, file), 'utf8'));
  if (only.length && !only.includes(sample.id)) continue;
  const { recording, log } = await recordSample(sample, llm);
  for (const l of log) {
    total += l.tokens;
    console.log(`${sample.id.padEnd(7)} ${l.lang}  recorded: ${l.recorded.join(', ') || 'nothing'} · ${l.tokens} tokens · ${l.verified} verified, ${l.dropped} dropped${l.failed.length ? `\n        FAILED ${l.failed.join(' | ')}` : ''}`);
  }
  const outFile = path.join(outDir, file);
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch { previous = null; }
  const merged = mergeRecording(previous, recording, log);
  for (const lang of merged.kept) console.log(`${sample.id.padEnd(7)} ${lang}  failed this time: kept the previous complete ${lang} recording`);
  if (log.some((l) => l.recorded.length)) fs.writeFileSync(outFile, `${JSON.stringify(merged.recording, null, 2)}\n`);
  else console.log(`${sample.id.padEnd(7)} nothing recorded, ${file} left as it was`);
}
console.log(`done · ${total} tokens in total · files in fixtures/recorded/ · next: npm test, then npm run sample`);
