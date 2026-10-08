# Proofline accuracy

**Status: round 1 measured (8 Oct 2026). Errors found in round 1 are being fixed; round 2 will re-measure.**

## Method

1. The live agent (Tavily + Nemotron 3 Super on Nebius Token Factory + live checks) runs on a fixed list of 12 real Turkish small businesses (`eval/businesses.json`), mostly online shops.
2. Every run is saved (`eval/runs/<date>.json`): claims proposed, claims the gate kept, claims it dropped (with reason), model calls.
3. Each kept claim is re-checked independently, outside Proofline (curl, openssl, the full page HTML, Nominatim, direct domain probes), and marked right or wrong (`eval/verdicts.json`).
4. The table below is filled from those marks only.

## Results

| Round | Date | Businesses | Claims proposed | Dropped by the gate | Kept | Kept and correct (independent check) | Accuracy of kept claims |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-08 | 12 | 40 | 7 | 33 | 24 | 73% |

All 7 dropped claims deserved to be dropped (none was a true claim lost).

## What the gate dropped, and why

| Claim type | Times dropped | Most common reason |
| --- | --- | --- |
| no_own_website | 3 | Search found the business's own site after all (peymanshop.com, kampveotesi.com, tarimgaraj.com) |
| site_online | 2 | The model picked a domain that does not name the business (peyman.com.tr, otesi.es) |
| possibly_renamed | 2 | A different name on an unverified site is not evidence of a rename |

## Errors found

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| A domain typed after the name ("Name, example.com") was used as the city, so the map lookup found nothing | 1 (round 1a, before the measured run) | Fixed: a domain is never a city | `tests/intake-domain.test.mjs` |
| Absence read from a truncated page: the fetch keeps 400 KB, a tel: link sat at ~804 KB | 2 | Planned: absence on a truncated page is "not checked" | — |
| Own-site identity accepted on a name match alone (petpal.com is a US network, not the Bursa shop) | 2 | Planned | — |
| "No website" concluded from 5 search results without probing the obvious domain (naramica.com, vatkalimon.com) | 2 | Planned | — |
| OSM name match too strict ("Sakal Kafe Pub" vs "Sakal Pub", same street) | 1 | Planned | — |
| Contact path ignores an email and phone shown as plain text | 1 | Planned | — |
