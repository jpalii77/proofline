# Proofline accuracy

**Status: round 8 measured (12 Oct 2026): on 12 businesses never seen before, with mixed input, 21 of 23 kept claims were correct (91%); see Round 8 below. Round 7 (12 Oct 2026): on the hardest input, 12 online shops queried by bare name only, 21 of 21 checkable kept claims were correct (5 more could not be settled), with more true findings than before on this list (26 kept, vs 22 in round 5). Two changes got there: a better discovery search (the plain name with 10 Tavily results instead of "name official website phone" with 5: the business's own site appeared in 8 of 9 cases instead of 5 of 9), and four identity guards that round 6 showed the better search needed. Round 3, on businesses typed with their city: 86% (18 of 21).**

## Method

1. The live agent (Tavily + Nemotron 3 Super on Nebius Token Factory + live checks) runs on a fixed list of 12 real Turkish small businesses: rounds 1–2 on `eval/businesses.json` (mostly online shops); round 3 on a new list, `eval/businesses-2.json` (wedding venues, hotels, dental clinics and a driving school in five cities), so the fixes are tested on businesses they were not made for; round 4 on another new list, `eval/businesses-3.json` (online shops, bare names only), to find the limits.
2. Every run is saved (`eval/runs/<date>.json`): claims proposed, claims the gate kept, claims it dropped (with reason), model calls.
3. Each kept claim is re-checked independently, outside Proofline (curl, openssl, the full page HTML, Nominatim, direct domain probes), and marked right or wrong (`eval/verdicts.json` for round 1, `eval/verdicts-r2.json` for round 2, `eval/verdicts-r3.json` for round 3, `eval/verdicts-r4.json` to `eval/verdicts-r7.json` for rounds 4–7; rounds 3–7 also judge every dropped claim). A claim the check cannot settle is marked unverifiable and left out of the percentage.
4. The table below is filled from those marks only.

## Results

| Round | Date | Businesses | Claims proposed | Dropped by the gate | Kept | Kept and correct (independent check) | Accuracy of kept claims |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-08 | 12 | 40 | 7 | 33 | 24 | 73% |
| 2 | 2026-10-08 (after the round-1 fixes) | 12 | 39 | 6 | 33 | 29 | **88%** |
| 3 | 2026-10-11 (new list, after the round-2 fixes) | 12 | 26 | 5 | 21 | 18 | **86%** |
| 4 | 2026-10-12 (new list, bare names only) | 12 | 27 | 1 | 26 | 12 of 23 checkable (3 unverifiable) | **52%** |
| 5 | 2026-10-12 (same list, after the round-4 fixes) | 12 | 25 | 3 | 22 | 18 of 20 checkable (2 unverifiable) | **90%** |
| 6 | 2026-10-12 (same list, new discovery search, before guards) | 12 | 34 | 4 | 30 | 17 of 24 checkable (6 unverifiable) | 71% |
| 7 | 2026-10-12 (same list, new search + round-6 guards) | 12 | 30 | 4 | 26 | 21 of 21 checkable (5 unverifiable) | **100%** |
| 8 | 2026-10-12 (fresh list, mixed input, no fixes in between) | 12 | 24 | 1 | 23 | 21 of 23 | **91%** |

Round 1: all 7 dropped claims deserved to be dropped. Round 2: 4 of 6 deserved it; 2 were true claims lost (petpal.com.tr is the Bursa shop, but its 6 MB homepage names "Petpal" only past the part the identity check read; fixed below). A lost claim makes the report shorter, never wrong.

Round 3 (new businesses): of the 5 dropped claims, 2 deserved it and 3 were true claims lost (a domain with no DNS record that nothing tied to the business; a namesake the identity check would not settle; a hotel-directory page taken for the hotel's site). The 3 wrong kept claims concern two businesses (below).

Round 4 (bare names): the one dropped claim deserved it (aktiv.com is not Aktifim). 11 kept claims were wrong: 7 about foreign namesakes (Shout → a US TV service and a place in Massachusetts; Loky → an AI company and a village in Madagascar), 2 "no website of its own" for shops that have one, 1 rename read from a title that is just the address, 1 map match on another pet shop with the same two words reversed. The run also missed 5 own sites without making a claim about them (listed in `eval/verdicts-r4.json`).

Round 5 (same list, after the fixes): all 3 dropped claims deserved it (a "no website" for Hilal AV Market, whose site the planner's guessed city kept unsettled; leadiq.com taken for Shout; a "no website" for Loky with lokyai.com only loosely matching). 2 kept claims were wrong: Aktifim's "no website" (its site has another name; known limit) and a map claim about "Shout Outdoor Media", a company the planner narrowed the bare name "Shout" to (fixed after the round: such a guess between namesakes is not used, `tests/round4-identity.test.mjs`). Markapia and Tuba Butik now get their own sites checked: 5 more true findings than in round 4.

Round 6 (new discovery search): the plain-name search found more real own sites (Pet Ankara, Toker Bebe), but also more namesakes and placeholders, and accuracy fell to 71%: the planner turned "Lost Mind" into "Lost Minds" (a games company) and its address then matched; "Shout" was told it has no website; osepet.net ("Yakında Başlatılacak", launching soon) counted as a real site; a template's 212 123 45 67 counted as the business's phone.

Round 7 (same list, with four guards for those): no wrong kept claim (21 of 21 checkable). New true findings: Hilal AV Market's and Tuba Butik's own sites with their certificates, and a listed phone missing from Hilal's site. One true claim was lost on the cautious side (tokerkids.com is Toker Bebe's second site, but with a bare name its title only contains the name). After the round, a page whose only name is its own address no longer settles identity for names under 7 letters, which removes the 3 unverifiable osepet.net claims.

Round 8 (`eval/businesses-4.json`, 12 businesses never measured before, `eval/verdicts-r8.json`): rounds 4–7 re-ran one list, so its 100% could mean the fixes only fit those shops. On fresh businesses with mixed input (2 name + domain, 2 name + city, 8 bare names), 21 of 23 kept claims were right (91%), every one checkable; no foreign namesake was taken and all five Shopier-only sellers were correctly told they have no website of their own. The one dropped claim deserved it. 2 wrong: Lahza Butik was told it has no website, but its shop is lahzaabutik.com (the address doubles the a); D&P Perfumum was told it is missing from OpenStreetMap, but it is listed in Ümraniye: for a bare name the planner guessed the city "Köln" and the map search used it. Three own sites were missed without a claim (dpperfumum.com.tr, lahzaabutik.com, antakiaartisan.com).

Nemotron 3 Ultra vs Super on the planner's decision (`scripts/ultra-compare.mjs`, same 12 businesses): with the old search both chose right in only 7–8 of 12, mostly because the right site was not in the results at all; with the new search Super was right in 11 of 12 and Ultra in 10 of 12, Ultra a little faster (2.9 s vs 3.4 s on average) with more output tokens. Better search mattered far more than a bigger model, so the planner stays on Super.

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

### Round 3 (new list of 12 local businesses)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| The address built from the name was tried on https only; sunsetboutiquehotel.com answers on plain http (its https is broken), so the hotel was told it has no website | 1 (no_own_website) | Fixed (11 Oct): when https does not load, the same address is tried on plain http; whether https works stays a separate check | `tests/round3-identity.test.mjs` |
| The map retry without generic words left one word ("Santral") that matched a clothes shop for a dental clinic | 1 (on_map) | Fixed (11 Oct): when the name says what kind of place it is (Diş, Kafe, Otel…), a map match of another kind (shop=clothes) is not the business | `tests/round3-identity.test.mjs` |
| A hotel directory's subdomain (golden-boutique.ankarahotels.org) was taken for the hotel's own site | 0 (1 true claim lost) | Fixed (11 Oct): a subdomain of a site whose own name does not carry the business's name is someone else's page | `tests/round3-identity.test.mjs` |
| Shared trade words made two schools one: "Aysan Sürücü Kursu" (aysansurucukursu.com) passed for "A2 Sürücü Kursu" | 0 (the claim was dropped, for the wrong reason) | Fixed (11 Oct): trade words (Sürücü Kursu, Butik Otel, Ağız ve Diş…) are set aside and what is left of both names must match | `tests/round3-identity.test.mjs` |
| Known limit, not fixed: the hotel is on OpenStreetMap under an older name ("Sunset Pansiyon and Apartments", Çıralı) | 1 (not_on_map) | A name search cannot know an older name; a later round may compare the map entry's phone or website with the site's | — |

### Round 4 (new list of 12 online shops, bare names only)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Bare common name, no city: a foreign namesake's site and map place were taken (shout-tv.com "Shout! TV", lokyai.com "Loky AI"; Massachusetts, Madagascar) | 7 | Fixed (12 Oct): with no city and no address typed, a site counts only if a title part, og:site_name or heading is exactly the name ("SHOUT – Oversize Giyim" yes, "Shout! TV" no) or the address is the whole name written as one word (7+ letters); a looser match is "may be a namesake", never "theirs". A one-word name found on the map with no city is not tied to the business | `tests/round4-identity.test.mjs` |
| "No website" while the address built from the name exists (hilalavmarket.com; its title names products, not the shop) | 1 | Fixed (12 Oct): an address that is the whole name written as one word, loading a real page (not a for-sale page), is the business's site | `tests/round4-identity.test.mjs` |
| "No website" for a shop whose site has another name (Aktifim sells on kozmetikvagonu.com) | 1 | Known limit, not fixed: nothing in the name leads there; the claim already says "no website of its own was found" | — |
| Rename read from a page title that is the address itself ("erenhobi.com" vs "Eren Hobi") | 1 | Fixed (12 Oct): a title (or title part) that is the name written as one word, or the address itself, names the business | `tests/round4-identity.test.mjs` |
| Map match on another shop with the same words reversed, one being the city ("Ankara Pet" for "Pet Ankara") | 1 | Fixed (12 Oct): when the name holds the city word, the map name must carry it in the same order (one may be part of the other) | `tests/round4-identity.test.mjs` |
| For-sale pages written as "osepet.com for sale" or "Domain for sale" were not recognised as parked | 0 (found while fixing) | Fixed (12 Oct): both forms are parked markers | `tests/round4-identity.test.mjs` |

### Round 6 (same list, new discovery search)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Bare name: the planner's tidier name ("Lost Minds") and guessed city replaced the typed one, so a namesake's address matched | 4 | Fixed (12 Oct): with only a name typed, identity is checked against that name with no city; the planner's name is shown only if it is the same words, its city is used only for the map | `tests/round6-identity.test.mjs` |
| "No website of its own" for a one-word common name ("Shout"; the Turkish shop has shout.com.tr) | 1 | Fixed (12 Oct): a single word under 7 letters with nothing else is "not settled"; longer unusual words (Vatkalimon) keep the old rule | `tests/round6-identity.test.mjs` |
| A Turkish "launching soon" page (osepet.net, "Yakında Başlatılacak") counted as a real site | 1 | Fixed (12 Oct): "yakında başlatılacak / açılacak", "yapım aşamasında", "launching soon", "under construction" are placeholder markers | `tests/round6-identity.test.mjs` |
| A template's sequential number (212 123 45 67) counted as the business's phone | 1 | Fixed (12 Oct): counting runs and repeated digits prove nothing either way | `tests/round6-identity.test.mjs` |
| (found in round 7) A page whose only name is its address ("osepet.net") settled identity for a short name | 0 (3 unverifiable) | Fixed (12 Oct): such a title counts like the address itself, only for names of 7+ letters | `tests/round6-identity.test.mjs` |
| Discovery search missed the business's own site in 4 of 9 cases ("name official website phone", 5 results) | (lost true findings) | Fixed (12 Oct): the plain name and city, 10 results; own site found in 8 of 9 (`scripts/search-variants.mjs`) | `tests/discovery-search.test.mjs` |

### Round 8 (fresh list of 12, mixed input)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| For a bare name the planner guessed a city ("Köln" for D&P Perfumum, an Istanbul shop) and the map search used it, so "missing from OpenStreetMap" was kept | 1 (not_on_map) | Planned: a city the user did not type never narrows a map search that can end in "not on the map" | — |
| "No website" while the shop's address spells the name with a doubled letter (lahzaabutik.com for Lahza Butik) | 1 (no_own_website) | Planned: before "no website", try the search again with "site" / the name + ".com" and accept an address whose page names the business exactly | — |
| Own site missed: the name-built guess kept the "&" (dpperfumum.com.tr for D&P Perfumum) | 0 (true finding lost) | Planned: drop "&" and similar marks when building the address from the name | — |
| Own site left unsettled: the typed city is Antakya, the brand on the page says "Antakia" | 0 (true finding lost) | Known limit for now | — |
