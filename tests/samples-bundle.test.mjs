// Every fixture file is bundled (Workers have no file system, so samples are imported as modules).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadSamples } from '../src/io/sample.mjs';

test('the bundled sample list matches fixtures/sample/', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sample');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const onDisk = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id);
  assert.deepEqual(loadSamples().map((s) => s.id), onDisk);
});
