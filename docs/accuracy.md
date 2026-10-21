# Proofline accuracy

**Status (19 Oct 2026): on the last four fresh lists, 48 real Turkish businesses the fixes were never made for (rounds 14, 16, 18 and 19), 109 of 114 checkable kept claims were right (96%): 18 of 18, 32 of 33, 32 of 33 and 27 of 30. Every error became a fix with a regression test or a named limit (see Round 19 below). This is the number shown on the demo's landing page; a test keeps the two in step.**

**Earlier status (14 Oct 2026): round 14, on a third list of 12 businesses never measured before, kept no wrong claim (18 of 18 checkable right). The route there: round 12 tested the round-8–11 fixes on a fresh list and fell to 61%, which showed how much of the 96% reached on one list had only fitted those shops; its four causes (empty or parked pages taken as sites, namesakes abroad, map matches under a guessed city, "secure HTTPS" on a 404) were fixed, round 13 re-measured 91%, and one more guard for common names led to round 14. Lesson kept: every fix is measured on businesses it was not made for.**

**Earlier status, round 8 (12 Oct 2026): on 12 businesses never seen before, with mixed input, 21 of 23 kept claims were correct (91%); see Round 8 below. Round 7 (12 Oct 2026): on the hardest input, 12 online shops queried by bare name only, 21 of 21 checkable kept claims were correct (5 more could not be settled), with more true findings than before on this list (26 kept, vs 22 in round 5). Two changes got there: a better discovery search (the plain name with 10 Tavily results instead of "name official website phone" with 5: the business's own site appeared in 8 of 9 cases instead of 5 of 9), and four identity guards that round 6 showed the better search needed. Round 3, on businesses typed with their city: 86% (18 of 21).**

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
| 9 | 2026-10-14 (same list as round 8, after the round-8 fixes) | 12 | 27 | 3 | 24 | 22 of 24 | **92%** |
| 10 | 2026-10-14 (same list, after the round-9 fixes) | 12 | 26 | 2 | 24 | 23 of 24 | **96%** |
| 11 | 2026-10-14 (same list, after the round-10 fix) | 12 | 28 | 3 | 25 | 23 of 24 checkable (1 unverifiable) | **96%** |
| 12 | 2026-10-14 (fresh list `businesses-5.json`, mixed input) | 12 | 35 | 1 | 34 | 20 of 33 checkable (1 unverifiable) | 61% |
| 13 | 2026-10-14 (same fresh list, after the round-12 fixes) | 12 | 28 | 6 | 22 | 20 of 22 | **91%** |
| 14 | 2026-10-14 (third fresh list `businesses-6.json`, after the round-13 fix) | 12 | 25 | 5 | 20 | 18 of 18 checkable (2 unverifiable) | **100%** |
| 15 | 2026-10-14 (same list, after the lost-finding fixes) | 12 | 26 | 3 | 23 | 23 of 23 | **100%** |
| 16 | 2026-10-14 (fourth fresh list `businesses-7.json`) | 12 | 33 | 0 | 33 | 32 of 33 | **97%** |
| 17 | 2026-10-15 (same list, after the round-16 fixes) | 12 | 35 | 0 | 35 | 35 of 35 | **100%** |
| 18 | 2026-10-15 (fifth fresh list `businesses-8.json`, after the audit fixes) | 12 | 33 | 0 | 33 | 32 of 33 | **97%** |
| 19 | 2026-10-16 (sixth fresh list `businesses-9.json`, after the round-18 fix) | 12 | 32 | 2 | 30 | 27 of 30 | 90% |

Round 1: all 7 dropped claims deserved to be dropped. Round 2: 4 of 6 deserved it; 2 were true claims lost (petpal.com.tr is the Bursa shop, but its 6 MB homepage names "Petpal" only past the part the identity check read; fixed below). A lost claim makes the report shorter, never wrong.

Round 3 (new businesses): of the 5 dropped claims, 2 deserved it and 3 were true claims lost (a domain with no DNS record that nothing tied to the business; a namesake the identity check would not settle; a hotel-directory page taken for the hotel's site). The 3 wrong kept claims concern two businesses (below).

Round 4 (bare names): the one dropped claim deserved it (aktiv.com is not Aktifim). 11 kept claims were wrong: 7 about foreign namesakes (Shout → a US TV service and a place in Massachusetts; Loky → an AI company and a village in Madagascar), 2 "no website of its own" for shops that have one, 1 rename read from a title that is just the address, 1 map match on another pet shop with the same two words reversed. The run also missed 5 own sites without making a claim about them (listed in `eval/verdicts-r4.json`).

Round 5 (same list, after the fixes): all 3 dropped claims deserved it (a "no website" for Hilal AV Market, whose site the planner's guessed city kept unsettled; leadiq.com taken for Shout; a "no website" for Loky with lokyai.com only loosely matching). 2 kept claims were wrong: Aktifim's "no website" (its site has another name; known limit) and a map claim about "Shout Outdoor Media", a company the planner narrowed the bare name "Shout" to (fixed after the round: such a guess between namesakes is not used, `tests/round4-identity.test.mjs`). Markapia and Tuba Butik now get their own sites checked: 5 more true findings than in round 4.

Round 6 (new discovery search): the plain-name search found more real own sites (Pet Ankara, Toker Bebe), but also more namesakes and placeholders, and accuracy fell to 71%: the planner turned "Lost Mind" into "Lost Minds" (a games company) and its address then matched; "Shout" was told it has no website; osepet.net ("Yakında Başlatılacak", launching soon) counted as a real site; a template's 212 123 45 67 counted as the business's phone.

Round 7 (same list, with four guards for those): no wrong kept claim (21 of 21 checkable). New true findings: Hilal AV Market's and Tuba Butik's own sites with their certificates, and a listed phone missing from Hilal's site. One true claim was lost on the cautious side (tokerkids.com is Toker Bebe's second site, but with a bare name its title only contains the name). After the round, a page whose only name is its own address no longer settles identity for names under 7 letters, which removes the 3 unverifiable osepet.net claims.

Round 8 (`eval/businesses-4.json`, 12 businesses never measured before, `eval/verdicts-r8.json`): rounds 4–7 re-ran one list, so its 100% could mean the fixes only fit those shops. On fresh businesses with mixed input (2 name + domain, 2 name + city, 8 bare names), 21 of 23 kept claims were right (91%), every one checkable; no foreign namesake was taken and all five Shopier-only sellers were correctly told they have no website of their own. The one dropped claim deserved it. 2 wrong: Lahza Butik was told it has no website, but its shop is lahzaabutik.com (the address doubles the a); D&P Perfumum was told it is missing from OpenStreetMap, but it is listed in Ümraniye: for a bare name the planner guessed the city "Köln" and the map search used it. Three own sites were missed without a claim (dpperfumum.com.tr, lahzaabutik.com, antakiaartisan.com).

Round 9 (same list as round 8, `eval/verdicts-r9.json`): both round-8 errors are gone: Lahza Butik's own shop lahzaabutik.com is found (3 right claims instead of a false "no website"), and D&P Perfumum is no longer called missing from the map. 22 of 24 kept claims right (92%). One new error, counted twice: for the bare name "D&P Perfumum" the agent took dpperfumum.com.eg, an Egyptian shop of the same name (prices in EGP), as the business's site; the Istanbul shop's own site is dpperfumum.com.tr. Of the 3 dropped claims, 2 deserved it; 1 true finding was lost: an Instagram handle that looks like an address (ahit.tr, no DNS record) kept "no website" from being settled.

Round 10 (same list, `eval/verdicts-r10.json`): the Egyptian namesake is gone and Ahit Tesettür is now rightly told it has no website of its own (ahit.tr, its Instagram handle, has no DNS record). 23 of 24 kept claims right (96%). One wrong: D&P Perfumum's name-built address dpperfumum.com only forwards (over http) to the shop's working site dpperfumum.com.tr, and refuses https; the agent took the forwarding address as the site and said it "does not load". Fixed after the round. Both dropped claims deserved it (antakiaartisan.com, a known limit; ozgecakil.com may be Çakıl Butik's site, which a bare name cannot settle).

Round 11 (same list, `eval/verdicts-r11.json`): D&P Perfumum is now checked on its working site dpperfumum.com.tr (2 right claims instead of a false "does not load"). 23 of 24 checkable kept claims right (96%); Çakıl Butik's "no website" could not be settled (ozgecakil.com, "Özge Çakıl Butik", may or may not be the same shop). One wrong, and a lesson: Lahza Butik was again told it has no website, because the second search, which had found lahzaabutik.com in rounds 9 and 10, did not return it this time. Search results vary from run to run, so a fix that depends on them is not a fix. After the round the doubled-letter spelling became one of the name-built guesses, which do not depend on search. All 3 dropped claims deserved it.

Round 12 (`eval/businesses-5.json`, 12 businesses never measured before, `eval/verdicts-r12.json`): rounds 8–11 had re-run one list up to 96%, and a fresh list shows how much of that fitted those shops: 20 of 33 checkable kept claims right (61%). The wrong ones come from three businesses and four causes: Style Me Shop (6 wrong) was given stylemeshop.com, a script that jumps to a parking page, and a "Style Me Boutique" in South Carolina found under a city the planner guessed; MK Collection (4 wrong) was given mkcollection.com, a US fabrics company the name-built guess turned up, and a shop in Ukraine on the map; Bebetto (2 wrong) was checked on bebetto.com.tr, an empty page, instead of its site bebetto.com; and Kıvırcık Kızlar Gelsin's unconnected Wix domain (404) was called "secure and working over HTTPS". The six Shopier-only sellers and the four healthy sites were all reported right. All four causes were fixed after the round (below).

Round 13 (same fresh list, `eval/verdicts-r13.json`): 20 of 22 kept claims right (91%). The parked page, the US and Ukrainian namesakes and the empty page are gone; Bebetto is checked on its real site. The gate dropped 6 claims, 5 rightly; Parla Kozmetik's true "no website" was lost to ty.gl, Trendyol's short-link address, now on the platform list. The 2 wrong claims show what is still open: for the bare, common name "MK Collection" the name-built guess found mkcollection.com.tr, a Turkish protocol-gift business that happens to own that address. Reports are now shorter where the agent is unsure, which is the intended trade.

Round 14 (`eval/businesses-6.json`, a third list of 12 businesses never measured before, `eval/verdicts-r14.json`): no wrong kept claim, 18 of 18 checkable right. The traps held: the Chinese sites at t-brush.com and ysly.com, a Lebanese "T-Brush LB" and a UK T-Brush were not taken; the apostrophe in "Fatma Ana'dan" did not break the name-built address. Two claims could not be settled: for the bare name "Morfose" the agent reported on themorfose.com, the brand's official US store, while the Turkish business's site is morfose.eu/tr. The price of the caution added in rounds 12–13 shows too: 3 true site findings were lost (Thesezar's own site left unsettled, Jurassink's not checked, Zersay's "no website" not settled).

Round 15 (same list, `eval/verdicts-r15.json`): after the lost-finding fixes, 23 of 23 kept claims right and more of them (23 kept, against 20): Thesezar's own site is back, and Morfose is now reported on morfose.eu/tr, the Turkish business's site, instead of the brand's US store. A re-run of the list the fixes were made for, so the next fresh list is the real test.

Round 16 (`eval/businesses-7.json`, a fourth list of 12 businesses never measured before, `eval/verdicts-r16.json`): 32 of 33 kept claims right (97%), with the most findings of any round (33, including a certificate 29 days from expiry and a phone number confirmed on a site). The one wrong claim: Alesta Coffee was told its number "is not on the site", but the site shows it in its WhatsApp button and its structured business data, which the phone check did not read; fixed after the round. One true finding was lost: PatiBurda's own site, whose 1.4 MB homepage names Ankara once.

Round 17 (same list after the round-16 fixes, `eval/verdicts-r17.json`): 35 of 35 kept claims right, the most kept in any round. PatiBurda's own site came back with three true findings (site online, certificate healthy, phone 0850 308 00 87 shown on the site): its homepage was read a second time, further down, where its own text names its Ankara store at about 1.2 MB. Alesta's wrong "phone not on the site" is gone, but no phone claim was proposed for it at all, so its number is a true finding left out. A re-run of the list the fixes were made for, so it confirms the fixes; the next fresh list measures general accuracy.

Round 18 (`eval/businesses-8.json`, a fifth list of 12 businesses never measured before, `eval/verdicts-r18.json`): 32 of 33 kept claims right (97%), every one checkable, no crash, the second fresh list in a row at 97%. The traps held: Güneş Tıp Kitabevi was found at guneskitabevi.com (an address without "tıp"), Ocean Marine at its Turkish site rather than a namesake abroad, and the two sellers with no site (Meysera, Butik Leyla) were rightly told so; Ceran Saat's map entry is its branch in the Optimum mall in Gaziemir, one of its İzmir stores. The one wrong claim: Teknofish Elektronik was told it has no website of its own, but its shop is teknofish.com. Search returned only a map listing, the name-built address (teknofishelektronik.com) does not exist, and the site's title is a slogan; only its schema.org data names "Teknofish Elektronik". Fixed after the round (below).

Round 19 (`eval/businesses-9.json`, a sixth list of 12 businesses never measured before, `eval/verdicts-r19.json`): 27 of 30 kept claims right (90%), every one checkable, no crash; both claims the gate dropped deserved it (Bebeto: a Jordanian namesake shop and a London map entry). The traps held for addresses that leave out part of the name (abfen.com for Abfen Farma, ergandan.com.tr for "Ergan Sanal Market"), a .co ending and a dotted name. The 3 wrong claims all come from what the business's own pages say and the agent did not read: Fiyord Balık Av Market was told it has no website, but its Yandex Maps entry, among the search results, links balikavmarket.net, which names it in its schema.org data; and Yöresel Bakkal was told "a public page says it may have closed" (Apple Maps calls one Tereci branch in Çiğli "Permanently Closed", while its own site sells and lists four İzmir stores open every day) and "missing from OpenStreetMap" (its Bostanlı store is on the map as "Tereci"). The first two are fixed after the round (below); the map one is the known limit of round 3 (a business on the map under another name). A lower score than rounds 16 and 18 on a fresh list is the point of fresh lists: it shows what the agent still misses.

Nemotron 3 Ultra vs Super on the planner's decision (`scripts/ultra-compare.mjs`, same 12 businesses): with the old search both chose right in only 7–8 of 12, mostly because the right site was not in the results at all; with the new search Super was right in 11 of 12 and Ultra in 10 of 12, Ultra a little faster (2.9 s vs 3.4 s on average) with more output tokens. Better search mattered far more than a bigger model, so the planner stays on Super.

Ultra as a second opinion (20 Oct, `scripts/second-opinion-compare.mjs`, `eval/runs/second-opinion-2026-10-19.json`): on 46 businesses typed by name only (lists 4 to 9, each right answer settled by a measured round; 20 of them have no website of their own), the planner's website pick was right 29 times, a wrong site 14 times and missed 3. With the pipeline's rule (a pick stands only when Ultra, asked the same question on its own, chose the same site) it was right 32 times, a wrong site 10 times and missed 4. Ultra turned down four namesakes (ossy-brand.com, zerayinsaat.com.tr, etsy.com, leylahijabboutique.com) and one right pick (derimalzeme.com). When both models agree on a wrong site (lahzashop.com, dpfragrances.com, themorfose.com), the second opinion cannot help; the own-site checks after it still have to accept the site. Ultra was asked 31 times, about 2.9 s and 2,700 tokens a call; one reply ran out at its 3,000-token limit, now 5,000. This measures the model call alone, before the code checks.

What changed between rounds: Kaptan Oyuncak and Elle Shoes no longer get a false "no contact path"; Petpal is no longer confused with a US site; Vatkalimon's own site is found by trying the address built from its name; Sakal Kafe Pub is found on the map.

## Without the gate

What would a reader have seen if every claim Nemotron proposed were shown? Each round's file already says whether every dropped claim was in fact wrong, true, or could not be settled (`eval/gate-ablation.json`, one label per dropped claim, tied to the run files by a test). `node scripts/gate-ablation.mjs` turns that into the table below; no new runs, no network.

Across the 19 rounds, with the gate a reader saw **435 right and 62 wrong** claims (87.5%); without it they would have seen **446 right and 98 wrong** (82.0%). The gate removed 36 of the 98 wrong claims Nemotron proposed (37%), and lost 11 true ones; 9 dropped claims could not be settled either way and are left out of both counts.

| Round | With the gate: right / wrong | Without the gate: right / wrong | Dropped: wrong / true / unsettled |
| --- | --- | --- | --- |
| 1 | 24 / 9 (72.7%) | 24 / 16 (60%) | 7 / 0 / 0 |
| 2 | 29 / 4 (87.9%) | 31 / 8 (79.5%) | 4 / 2 / 0 |
| 3 | 18 / 3 (85.7%) | 21 / 5 (80.8%) | 2 / 3 / 0 |
| 4 | 12 / 11 (52.2%) | 12 / 12 (50%) | 1 / 0 / 0 |
| 5 | 18 / 2 (90%) | 18 / 5 (78.3%) | 3 / 0 / 0 |
| 6 | 17 / 7 (70.8%) | 17 / 8 (68%) | 1 / 0 / 3 |
| 7 | 21 / 0 (100%) | 22 / 3 (88%) | 3 / 1 / 0 |
| 8 | 21 / 2 (91.3%) | 21 / 3 (87.5%) | 1 / 0 / 0 |
| 9 | 22 / 2 (91.7%) | 23 / 4 (85.2%) | 2 / 1 / 0 |
| 10 | 23 / 1 (95.8%) | 23 / 2 (92%) | 1 / 0 / 1 |
| 11 | 23 / 1 (95.8%) | 23 / 4 (85.2%) | 3 / 0 / 0 |
| 12 | 20 / 13 (60.6%) | 20 / 14 (58.8%) | 1 / 0 / 0 |
| 13 | 20 / 2 (90.9%) | 22 / 6 (78.6%) | 4 / 2 / 0 |
| 14 | 18 / 0 (100%) | 20 / 0 (100%) | 0 / 2 / 3 |
| 15 | 23 / 0 (100%) | 23 / 1 (95.8%) | 1 / 0 / 2 |
| 16 | 32 / 1 (97%) | 32 / 1 (97%) | 0 / 0 / 0 |
| 17 | 35 / 0 (100%) | 35 / 0 (100%) | 0 / 0 / 0 |
| 18 | 32 / 1 (97%) | 32 / 1 (97%) | 0 / 0 / 0 |
| 19 | 27 / 3 (90%) | 27 / 5 (84.4%) | 2 / 0 / 0 |
| **All 19** | **435 / 62 (87.5%)** | **446 / 98 (82%)** | **36 / 11 / 9** |

Two things to read with it. Nemotron proposes after the checks have run and sees their results, so it already avoids many claims that would fail: the gate is the last line, not the only one. And the gate's share shrinks over the rounds (nothing dropped in rounds 16 to 18) because the checks themselves got better between rounds, so fewer wrong proposals reached it. The wrong claims the gate did keep come from checks that were themselves wrong; "Errors found" below lists them with their fixes.

## Per report: would the message have carried a false sentence?

Proofline is for people who sell web services to small businesses, and what they act on is a report, not a single claim: one false sentence in a message to an owner ("your site does not load" when it does) costs the whole conversation. So the same marks are also counted per business report: did the report show at least one wrong claim? `node scripts/report-impact.mjs` computes it from the run, verdict and gate-label files; no new runs, no network. Lists 3 to 9 are real prospects taken from the list of a web-services sales pipeline in Turkey, so these are the reports a seller would have used.

| Rounds | Business reports | With at least one wrong claim, with the gate | Without the gate |
| --- | --- | --- | --- |
| Round 1 (first list, first run, 8 Oct) | 12 | 6 | 9 |
| First run of every fresh list (rounds 1, 3, 4, 8, 12, 14, 16, 18, 19) | 108 | 24 | 31 |
| Last four fresh lists (rounds 14, 16, 18, 19) | 48 | 4 | 5 |
| All 19 rounds | 228 | 36 | 56 |

On the first list, 6 of the 12 reports would have put a false sentence in front of the owner, 9 of 12 without the gate: Kaptan Oyuncak told it has "no contact path" while its phone sat past the part of the page that was read, Petpal (Bursa) reported on petpal.com, a US pet network. On the last four fresh lists, 4 of 48 reports did (and 5 of 48 without the gate). Over all 19 rounds the gate kept 20 reports clean that would otherwise have carried a wrong claim: 36 of 228 reports had one with the gate, 56 of 228 without it. Round 1's run file holds 32 of the 33 kept claims in the table above (8 of its 9 wrong ones), so its report count may be one low.

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
| For a bare name the planner guessed a city ("Köln" for D&P Perfumum, an Istanbul shop) and the map search used it, so "missing from OpenStreetMap" was kept | 1 (not_on_map) | Fixed (14 Oct, not yet re-measured): when a city the user did not type finds nothing, the map is searched again without it; only then can "not on the map" stand | `tests/round8-identity.test.mjs` |
| "No website" while the shop's address spells the name with a doubled letter (lahzaabutik.com for Lahza Butik) | 1 (no_own_website) | Fixed (14 Oct, not yet re-measured): before "no website", one more search (the name + ".com"); what it finds faces the same identity test, and an address that is the whole name with one letter written twice (lahzaabutik) counts as the name | `tests/round8-identity.test.mjs` |
| Own site missed: the name-built guess kept the "&" (dpperfumum.com.tr for D&P Perfumum) | 0 (true finding lost) | Fixed (14 Oct): the name-built guess already dropped the "&" (dpperfumum.com.tr) and found the site, but the agent then discarded it because search had never shown that address. An address the check reached itself and confirmed is now used | `tests/round8-identity.test.mjs` |
| Own site left unsettled: the typed city is Antakya, the brand on the page says "Antakia" | 0 (true finding lost) | Known limit for now | — |

### Round 9 (same list, after the round-8 fixes)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| A bare name accepted a foreign country address that spells the whole name (dpperfumum.com.eg, an Egyptian namesake; the shop is dpperfumum.com.tr) | 2 (site_online, https_healthy) | Fixed (14 Oct, not yet re-measured): with no city or website typed, an address under another country's ending (.eg, .de…, not .tr or generic ones such as .io) is a possible namesake, never "theirs"; the search then goes on to the address built from the name (dpperfumum.com.tr) | `tests/round9-identity.test.mjs` |
| An Instagram handle read as a web address (ahit.tr, no DNS record) and a cut-off Shopier link (shopier.co) left "no website" unsettled | 0 (true finding lost) | Fixed (14 Oct, not yet re-measured): an address read from text with no DNS record is no website; a listed platform under another ending (shopier.co, tripadvisor.ie) is still that platform (names of 6+ letters only); Shopier added to the platform list | `tests/round9-identity.test.mjs` |

### Round 10 (same list, after the round-9 fixes)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| A name-built address that only forwards to the shop's real site (dpperfumum.com → dpperfumum.com.tr, https refused) was taken as the site, so the owner was told "does not load" | 1 (site_unreachable) | Fixed (14 Oct, not yet re-measured): an address whose page ends on another site is not the site; that target is checked and used instead (not a listing platform, never a mere http-to-https or www move) | `tests/round10-identity.test.mjs` |

### Round 11 (same list, after the round-10 fix)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| "No website" for Lahza Butik came back: the second search that had found lahzaabutik.com did not return it this run | 1 (no_own_website) | Fixed (14 Oct, not yet re-measured): for a two-word name the name-built guesses also try the one spelling with a word's last letter written twice (lahzaabutik.com), so it no longer depends on search | `tests/round10-identity.test.mjs` |

### Round 12 (fresh list, mixed input)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| An empty page (bebetto.com.tr, 0 bytes) or a script that jumps to a parking page (stylemeshop.com) counted as "real content" | 6 (site_online ×2, no_contact_path ×2, ssl_expiring_soon, no_https_redirect) | Fixed (14 Oct, not yet re-measured): a page with no title, no site name and almost no text is a placeholder; it is never "theirs" and never "real content" | `tests/round12-identity.test.mjs` |
| With a bare name, an address that spells the whole name was taken with nothing tying it to the business or to Turkey (mkcollection.com, a US company) | 3 (site_online, https_healthy, no_contact_path) | Fixed: with no city or website typed, such an address also needs a search result that ties it to the business, or something on it that ties it to Turkey (a .tr address, lang="tr", Turkish letters, a lira price, a +90 number); otherwise it may be a namesake abroad | `tests/round12-identity.test.mjs` |
| A map match under a city the planner guessed ("North Myrtle Beach"), or abroad for a name typed without a city (Dnipro), counted as "on the map"; a US phone from that match was then reported | 3 (on_map ×2, phone_unconfirmed) | Fixed: only a typed city ties a map match to the business; without one, a match outside Turkey (or for a one-word name, any match) is not settled | `tests/round12-identity.test.mjs` |
| "Valid certificate and HTTPS" kept for a domain answering 404 (an unconnected Wix domain) | 1 (https_healthy) | Fixed: that claim now also needs the site to load | `tests/round12-identity.test.mjs` |

### Round 13 (same fresh list, after the round-12 fixes)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| A bare, common name ("MK Collection"): the name-built guess mkcollection.com.tr belongs to another Turkish business | 2 (site_online, no_https_redirect) | Fixed (14 Oct, not yet re-measured): for a bare name made only of initials and common shop words ("MK Collection", "Style Me Shop"), an address no search result ties to the business must link to the business's own listing from search (its Instagram, Shopier, Facebook or TikTok page); a distinctive name (Lahza, Perfumum, Naramica) is unchanged | `tests/round13-identity.test.mjs` |
| ty.gl (Trendyol's short links) tried as an own site, so Parla Kozmetik's "no website" was not settled | 0 (true finding lost) | Fixed: ty.gl is on the platform list | `tests/round12-identity.test.mjs` |

### Round 14 (third fresh list): true findings lost

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Thesezar, typed with İzmir: its 5 MB homepage names İzmir only past the part we read, so its own site stayed "not settled" | 0 (true finding lost) | Fixed (14 Oct, not yet re-measured): when the homepage does not name the typed city, the contact or about page it links to on the same site (/pages/iletisim) is read for it | `tests/round14-identity.test.mjs` |
| Morfose, a bare name: the report was about themorfose.com, the brand's US store, not the Turkish business's site morfose.eu/tr | 2 unverifiable | Fixed: with a bare name, a chosen site that shows nothing tied to Turkey gives way to the Turkish site the name-built address leads to (morfose.com.tr forwards to morfose.eu/tr); another country's ending is accepted when the page itself is Turkish | `tests/round14-identity.test.mjs` |

### Round 16 (fourth fresh list)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Alesta Coffee's number was called "not on the site", but the site shows it in a WhatsApp button and in its structured business data | 1 (phone_unconfirmed) | Fixed (15 Oct; round 17: the wrong claim is gone, though no phone claim was proposed): numbers in wa.me / api.whatsapp.com links and in "telephone" structured data count as listed | `tests/round14-identity.test.mjs` |
| PatiBurda's own site not reported (Ankara named once, deep in a 1.4 MB page) | 0 (true finding lost) | Fixed (15 Oct; round 17: the site and 3 true findings are back): when the typed city is neither in the part of the homepage we read nor on its contact page, the cut-off homepage is read once more, up to 2 MB, for the city alone (same site only). On the saved real page this now finds Ankara at 1.2 MB | `tests/round16-deep-city.test.mjs` |

### Round 18 (fifth fresh list)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Teknofish Elektronik was told it has no website of its own; its shop is teknofish.com, an address without "Elektronik", whose title is a slogan and whose name appears only in its schema.org data | 1 (no_own_website), plus 2 true findings lost (site online, certificate healthy) | Fixed (15 Oct, not yet re-measured): the schema.org Organization or store name counts as the page naming itself; the name-built guess also tries the name without a trailing word for what the shop sells ("Elektronik", "Kozmetik"), and such a shortened address counts only when its page names the whole business exactly, with or without a city. On the saved real page this now finds teknofish.com | `tests/round18-identity.test.mjs` |

### Round 19 (sixth fresh list)

| Error | Wrong claims | Fix | Regression test |
| --- | --- | --- | --- |
| Fiyord Balık Av Market was told it has no website; its shop is balikavmarket.net (no "Fiyord" in the address), which search did not return but its Yandex Maps entry in the results links | 1 (no_own_website) | Fixed (16 Oct, not yet re-measured): before "no website", up to 3 listings among the search results are read for the website they link (`itemprop="url"`, "urls" / "website" page data); the linked site must pass the same identity test, and one that only loosely matches leaves "no website" unsettled. On the saved real pages this now finds balikavmarket.net | `tests/round19-identity.test.mjs` |
| Yöresel Bakkal was told a public page says it may have closed: one Apple Maps branch entry, while its own site sells and lists four stores open every day | 1 (possibly_closed) | Fixed (16 Oct): when the business's own domain is known and loads with real content, a closure phrase is "not settled" (one branch or an old entry), so the claim is not kept | `tests/round19-identity.test.mjs` |
| Yöresel Bakkal was told it is missing from OpenStreetMap; its Bostanlı store is on the map as "Tereci", the brand its site and Instagram use | 1 (not_on_map) | Fixed (19 Oct, not yet re-measured): before "not on the map", the other names the business's own site goes by (its og:site_name, structured data and the accounts it links, without words the typed name and city already hold: "tereci") are looked up in the city the user typed; a place there, in Turkey, under a matching name leaves the claim not settled. With no own site, or a city the planner guessed, nothing changes. The Atlas example (a shop renamed Velo Atölye, on the map under that name) no longer keeps "missing from OpenStreetMap" either | `tests/round19-map-alias.test.mjs` |
