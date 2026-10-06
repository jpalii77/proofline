// List the model IDs your Token Factory key can use, highlighting NVIDIA Nemotron.
// Use it to fill NEBIUS_REASONING_MODEL and NEBIUS_FAST_MODEL with exact IDs.
import { createTokenFactoryClient } from '../src/llm.mjs';
import { readConfig } from '../src/runtime.mjs';

const cfg = readConfig();
if (!cfg.nebius.apiKey) { console.error('Set NEBIUS_API_KEY first.'); process.exit(1); }
const ids = await createTokenFactoryClient(cfg.nebius).listModels();
const nemotron = ids.filter((id) => /nemotron/i.test(id));
console.log('Nemotron models:\n  ' + (nemotron.join('\n  ') || '(none found)'));
console.log(`\n${ids.length} models in total.`);
