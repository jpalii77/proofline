// Which discovery search finds the business's own site most often? Tries query/parameter variants on the
// same 12 cases as ultra-compare.mjs (expected sites from our independent checks) and counts, per variant,
// in how many cases the expected own site appears among the results. 1 Tavily credit per search (basic).
//   TAVILY_API_KEY=... node scripts/search-variants.mjs
import { normalizeHost } from '../src/text.mjs';

const key = process.env.TAVILY_API_KEY;
if (!key) { console.error('Set TAVILY_API_KEY first.'); process.exit(1); }

const CASES = [
  ['Shout', null, 'shout.com.tr'], ['Loky', null, null], ['Hilal AV Market', null, 'hilalavmarket.com'],
  ['Eren Hobi', null, 'erenhobi.com'], ['Markapia', null, 'markapia.com'], ['Tuba Butik', null, 'tubabutik.com'],
  ['Toker Bebe', null, 'tokerbebe.com'], ['Pet Ankara', 'Ankara', 'petankara.com.tr'], ['Osepet', null, null],
  ['Santral Ankara Diş', 'Ankara', 'santralankara.com'], ['Sunset Boutique Hotel', 'Antalya', 'sunsetboutiquehotel.com'],
  ['Pelops Boutique Otel', 'Ankara', null],
];

const VARIANTS = {
  'now (5, official website phone)': (n, c) => ({ query: `${n} ${c || ''} official website phone`, max_results: 5 }),
  '10 results': (n, c) => ({ query: `${n} ${c || ''} official website phone`, max_results: 10 }),
  'quoted name, 10': (n, c) => ({ query: `"${n}" ${c || ''}`, max_results: 10, exact_match: true }),
  'quoted name + country turkey, 10': (n, c) => ({ query: `"${n}" ${c || ''}`, max_results: 10, exact_match: true, country: 'turkey' }),
  'plain name + country turkey, 10': (n, c) => ({ query: `${n} ${c || ''}`, max_results: 10, country: 'turkey' }),
};

async function search(body) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ search_depth: 'basic', include_answer: false, topic: 'general', ...body, query: body.query.replace(/\s+/g, ' ').trim() }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}` };
  return res.json();
}

const totals = {};
for (const [variant, make] of Object.entries(VARIANTS)) {
  let found = 0; let withSite = 0; const misses = [];
  for (const [name, city, site] of CASES) {
    if (!site) continue;
    withSite++;
    const r = await search(make(name, city));
    const hosts = (r.results || []).map((x) => normalizeHost(x.url));
    const hit = hosts.some((h) => h === site || h?.endsWith(`.${site}`));
    if (hit) found++; else misses.push(r.error ? `${name} (${r.error})` : name);
  }
  totals[variant] = `${found}/${withSite}`;
  console.log(`${variant.padEnd(36)} own site found in ${found}/${withSite}${misses.length ? ` · missed: ${misses.join(', ')}` : ''}`);
}
