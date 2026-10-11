// The recorded sample businesses, bundled as JSON modules so the same code runs on Node and on
// Cloudflare Workers (no file system there). Adding a fixture: add its import here
// (tests/samples-bundle.test.mjs fails if a file in fixtures/sample/ is missing from this list).
//
// fixtures/recorded/ holds real Nemotron answers for each example (`npm run record-samples`);
// an empty file ({}) means "not recorded yet" and the rule-based stand-in plays the model.

import lumen from '../../fixtures/sample/1-lumen.json' with { type: 'json' };
import harbor from '../../fixtures/sample/2-harbor.json' with { type: 'json' };
import atlas from '../../fixtures/sample/3-atlas.json' with { type: 'json' };
import kuzey from '../../fixtures/sample/4-kuzey.json' with { type: 'json' };
import lumenRec from '../../fixtures/recorded/1-lumen.json' with { type: 'json' };
import harborRec from '../../fixtures/recorded/2-harbor.json' with { type: 'json' };
import atlasRec from '../../fixtures/recorded/3-atlas.json' with { type: 'json' };
import kuzeyRec from '../../fixtures/recorded/4-kuzey.json' with { type: 'json' };

const withRecording = (sample, recorded) => (recorded && Object.keys(recorded).length ? { ...sample, recorded } : sample);

export const SAMPLES = [
  withRecording(lumen, lumenRec),
  withRecording(harbor, harborRec),
  withRecording(atlas, atlasRec),
  withRecording(kuzey, kuzeyRec),
];
