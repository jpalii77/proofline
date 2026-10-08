# Proofline accuracy

**Status: round 2 measured (8 Oct 2026, same 12 businesses): 88% of kept claims correct, up from 73%. Its 3 new error types are fixed with regression tests; round 3 will re-measure.**

## Method

1. The live agent (Tavily + Nemotron 3 Super on Nebius Token Factory + live checks) runs on a fixed list of 12 real Turkish small businesses (`eval/businesses.json`), mostly online shops.
2. Every run is saved (`eval/runs/<date>.json`): claims proposed, claims the gate kept, claims it dropped (with reason), model calls.
3. Each kept claim is re-checked independently, outside Proofline (curl, openssl, the full page HTML, Nominatim, direct domain probes), and marked right or wrong (`eval/verdicts.json` for round 1, `eval/verdicts-r2.json` for round 2).
4. The table below is filled from those marks only.

## Results

| Round | Date | Businesses | Claims proposed | Dropped by the gate | Kept | Kept and correct (independent check) | Accuracy of kept claims |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-08 | 12 | 40 | 7 | 33 | 24 | 73% |
| 2 | 2026-10-08 (after the round-1 fixes) | 12 | 39 | 6 | 33 | 29 | **88%** |

Round 1: all 7 dropped claims deserved to be dropped. Round 2: 4 of 6 deserved it; 2 were true claims lost (petpal.com.tr is the Bursa shop, but its 6 MB homepage names "Petpal" only past the part the identity check read; fixed below). A lost claim makes the report shorter, never wrong.

What changed between rounds: Kaptan Oyuncak and Elle Shoes no longer get a false "no contact path"; Petpal is no longer confused with a US site; Vatkalimon's own site is found by trying the address built from its name; Sakal Kafe Pub is found on the map.

## What the gate dropped, and why

| Claim type | Times dropped | Most common reason |
| --- | --- | --- |
| no_own_website | 3 | Search found the business's own site after all (peymanshop.com, kampveotesi.com, tarimgaraj.com) |
| site_online | 2 | The model picked a domain that does not name the business (peyman.com.tr, otesi.es) |
| possibly_renamed | 2 | A different name on an unverified site is not evidence of a rename |

## Errors found

### Round 1

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| A domain typed after the name ("Name, example.com") was used as the city, so the map lookup found nothing | 1 (round 1a, before the measured run) | Fixed: a domain is never a city | `tests/intake-domain.test.mjs` |
| Absence read from a truncated page: the fetch keeps 400 KB, a tel: link sat at ~804 KB | 2 | Fixed (8 Oct, re-measured in round 2): the reader flags a cut-off page; on it, "not found" (contact, phone, name) is "not checked" | `tests/truncated-page.test.mjs` |
| Own-site identity accepted on a name match alone (petpal.com is a US network, not the Bursa shop) | 2 | Fixed (8 Oct, re-measured in round 2): with a city given, the homepage or a search result showing the site must also name that city; otherwise the site is "not settled" (a possible namesake), never "theirs" and never "no website" | `tests/round1-identity.test.mjs` |
| "No website" concluded from 5 search results without probing the obvious domain (naramica.com, vatkalimon.com) | 2 | Fixed (8 Oct, re-measured in round 2): before "no website", the address built from the name (`name.com`, `name.com.tr`) is tried; it counts only if its homepage names the business. Names under 7 letters are not guessed | `tests/round1-identity.test.mjs` |
| Map lookup found nothing for "Sakal Kafe Pub, Ankara"; OpenStreetMap has "Sakal Pub" on the same street | 1 | Fixed (8 Oct, re-measured in round 2): when the full name finds nothing, the name without generic words ("Kafe", "Shop"…) is tried once | `tests/round1-identity.test.mjs` |
| Contact path ignores an email and phone shown as plain text | 1 | Fixed (8 Oct, re-measured in round 2): a plain-text email or a labelled phone number ("Tel:", "Call", "İletişim"…) counts; bare numbers such as prices or order codes do not | `tests/truncated-page.test.mjs` |

### Round 2

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Own-site identity read from body text: a marketing agency's homepage (perfist.com) names "Tarım Garaj" as a client | 3 (site online, no HTTPS redirect, phone not on site — all about the agency's site) | Fixed (8 Oct): a name found only in body text counts when the address itself names the business or a homepage search result agrees | `tests/round2-identity.test.mjs` |
| The planner swapped the typed business for another one ("Naramica" became "NaraConcept", Athens) | 1 ("NaraConcept is missing from OpenStreetMap") | Fixed (8 Oct): the planner may tidy the typed name, never replace it; if it names a different business, its name, city, domain and phone are all discarded and the trace says why | `tests/round2-identity.test.mjs` |
| True site lost: a 6 MB homepage named the business only past the part read (petpal.com.tr) | 0 (2 true claims dropped) | Fixed (8 Oct): with a city given, an address that names the business counts, provided the page names that city | `tests/round2-identity.test.mjs` |
