// The recorded sample businesses, bundled as JSON modules so the same code runs on Node and on
// Cloudflare Workers (no file system there). Adding a fixture: add its import here
// (tests/samples-bundle.test.mjs fails if a file in fixtures/sample/ is missing from this list).

import lumen from '../../fixtures/sample/1-lumen.json' with { type: 'json' };
import harbor from '../../fixtures/sample/2-harbor.json' with { type: 'json' };
import atlas from '../../fixtures/sample/3-atlas.json' with { type: 'json' };
import kuzey from '../../fixtures/sample/4-kuzey.json' with { type: 'json' };

export const SAMPLES = [lumen, harbor, atlas, kuzey];
