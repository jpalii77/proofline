# Proofline — Devpost submission (v2)

## Project name

Proofline

## Tagline

An agent that researches a small business, lets NVIDIA Nemotron propose what is true, then re-checks every claim with code. Claims that fail their proof are dropped, in plain sight.

## Inspiration

People who sell web services to small businesses (agencies, freelancers) research each business before they call. More and more of that research is done by AI agents, and the agents repeat stale data with full confidence: "your site is down" when it loads fine, a phone number that belongs to the previous owner, a business that was renamed, a QR-menu page mistaken for the business's website. A seller who repeats that to the owner loses the call in the first sentence.

We had seen this in our own sales calls. So we wanted an agent with one rule: **the model may propose, but only evidence may decide.**

## What it does

You type a business name and city, or a domain. Proofline:

1. Searches the web for the business with **Tavily**.
2. Lets **NVIDIA Nemotron 3 Super** decide which domain and phone belong to it. A domain or phone that is not in the search results is removed by code.
3. Runs up to **12 evidence checks**: own-site identity, DNS, HTTPS reachability (two attempts), HTTP-to-HTTPS redirect, TLS certificate days left, parked/for-sale page, contact path, phone on the site, name match, OpenStreetMap listing, and a "permanently closed" search.
4. Lets Nemotron propose claims, but only from a fixed catalog of 15 claim types, where every type names the checks that prove it.
5. **The proof gate:** code re-runs every claim's proof from scratch. A claim survives only if every check returns exactly what the claim needs. Anything else, including "inconclusive" or "not checked", is dropped and stays on screen, struck through, with the reason.
6. **Nemotron 3 Nano** rewrites each verified claim in plain words for the owner; a rewrite that adds a number not in the evidence is rejected.
7. Nemotron 3 Super writes a **digital health card** summary and a short **pitch draft**, where every finding must cite a verified claim.

Every step streams to the page as a live trace. Every claim has a **Re-run proof** button. A **model calls panel** lists each Nemotron call: model, role, latency, tokens in and out from Token Factory's `usage` field, and whether code accepted, partly rejected, rejected or got no answer. Every report gets a read-only **share link** (kept 14 days).

The public demo opens with four recorded, fictional examples (instant, free) and a capped live mode that calls Tavily and Nemotron for real. The examples replay **real Nemotron answers**, recorded once on Token Factory in English and Turkish with their model ids, tokens and latency; the panel labels them "recorded, no new tokens", and the gate and the other code checks run again on every replay. The whole report follows the visitor's language, **English or Turkish**: Nemotron writes the owner lines, summary and pitch in that language, and the page shows the fixed wording (checks, claim sentences, drop reasons) in it too. An optional four-step **"How it works" tour** explains the page to a first-time visitor, and a visitor who types their own business while the examples are on gets a one-click "search it live" button instead of a dead end.

**Measured, not claimed:** nineteen rounds on 108 real Turkish businesses, every kept claim checked by hand outside Proofline. The number that matters is on businesses the fixes were never made for: on the last four fresh lists of 12, **109 of 114 checkable kept claims were right (96%)** (round 14: 18 of 18; round 16: 32 of 33; round 18: 32 of 33; round 19: 27 of 30), and every error became a fix or a named limit. Getting there included a published fall: fixes that reached 96% on one list scored 61% on a new one (round 12), and that is what made the agent trustworthy. See Accuracy below.

## How we built it

- **Runtime:** plain Node.js 20+, zero dependencies. Public demo on Cloudflare Workers, with a SQLite-backed Durable Object for daily quotas, a 24-hour query cache and share links.
- **NVIDIA Nemotron on Nebius Token Factory:** every model call goes to Token Factory's OpenAI-compatible Chat Completions API at runtime, with plain `fetch` (`src/llm.mjs`; prompts in `src/agent/nemotron-brain.mjs`).
  - **Structured output:** each call sends a JSON Schema (`response_format: json_schema`, strict) whose enums are filled from the run itself: the planner's domain can only be one of the web addresses Tavily returned (or null), a proposed claim type can only come from the catalog, and a pitch finding can only cite a verified claim id. The model is held to what it may say while decoding; code still checks every answer after. Verified live on both models (Super and Nano accepted the schema); if an endpoint refuses it, the call falls back to JSON mode once and the panel says so. In the 48 model calls of accuracy round 3, every one used the schema.
  - **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`, reasoning tier): planner, claim proposer and writer.
  - **Nemotron 3 Nano** (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, fast tier): plain-language rewrites, checked by `numbersGrounded` in `src/agent/pipeline.mjs`.
  - Token counts come from the API's `usage` field (`parseUsage`); a missing field is shown as unknown, never estimated.
- **Tavily** (`src/tavily.mjs`, `POST /search` at runtime):
  1. discovery: the only source the planner may take a domain or phone from. The query is the plain name and city with 10 results: measured on 12 businesses, it surfaces the business's own site in 8 of 9 cases, against 5 of 9 for "name official website phone" with 5 results, at the same one credit (`scripts/search-variants.mjs`);
  2. own-site identity: the same results decide whether a domain is really the business's own website or whether it only has listings;
  3. closure check: `"<name>" <city> permanently closed`, counted only if the same result names the business.
  The gate uses fresh I/O, so search-based claims are re-proven with a new Tavily call.
- **Guards in code:** grounding guard (domain and phone must come from search results, domain must have a real public-suffix ending), own-site guard (a listing platform is never "the website"), the gate (`gateClaim`), and a citation lint on the pitch.
- **Failure handling:** a failed model call, a time limit or a request limit turns the affected checks into "not checked", never into a finding. Server errors become a plain sentence, never a stack trace.
- **Interface:** single page, no framework; English and Turkish interface and report (`public/i18n.js`, `public/report-lang.js`), guided tour (`public/tour.js`), phone layout checked at 375 px.
- **Recorded examples:** `npm run record-samples` runs the four fictional examples once through the live Nemotron brain (7 calls each, English and Turkish) and saves every answer with its model id, tokens, latency and output format; the demo replays them (`src/agent/recorded-brain.mjs`). A step with no recording falls back to a rule-based stand-in, named as such.
- **Nemotron 3 Ultra, measured before used:** on the planner's hardest decision (which website, if any, belongs to the business) we ran Ultra and Super side by side on the same 12 businesses (`scripts/ultra-compare.mjs`). With the improved search, Super chose right in 11 of 12 and Ultra in 10 of 12, so the planner stays on Super and the credit goes further.
- **Audit:** on 15 October four separate AI review agents, each given one area (server security, interface, accuracy and robustness, setup) and none of them the one that wrote the code, read the whole repository and found 17 issues; we reproduced the important ones by hand before fixing, among them a share-page header injection, two phone numbers side by side read as one, and a closure phrase matched inside another word ("Ada" in "Canada"). 16 are fixed, each with a test; the 17th (a free, capped self-test endpoint) was judged harmless and left as is.
- **Tests:** 333 `node:test` tests, no network needed, including crash tests for odd input, broken services and malformed requests, and one regression test file per accuracy round. `SAMPLE_MODE` runs the whole agent on the recorded fixtures, so anyone can try it without keys.

## Challenges we ran into

Our own agent made exactly the mistake Proofline exists to prevent. On 6 October 2026 we ran it live for the first time, on a real café in Ankara:

1. **Run 1:** Nemotron picked the café's page on a QR-menu platform as "its website" and proposed six confident claims about a site that was not theirs. The gate kept all six, because each check was technically true for the platform page. We fixed it at the evidence level: a list of listing platforms, an own-site identity check, and every website claim now starts its proof with that check.
2. **Run 2:** an address abbreviation in a search snippet was read as a domain. We added an offline public-suffix check and a provenance rule: only web addresses that appear in the search results count.
3. **Run 3:** correct. No website of its own, listings only.

The fictional "Kuzey Kafe" example is built on that first trap. With the recorded Nemotron answers, the model no longer falls for it (it picks no domain), so the claims about "its website" never reach the gate; the catalog refuses them because there is no own domain.

Then we measured instead of guessing. Each kept claim was checked by hand, and each error turned into a fix with a regression test: 73% → 88% on 12 online shops, then 86% on 12 local businesses the fixes were never made for. The errors were instructive: a cut-off page read as "no contact info", a US namesake taken for a Bursa shop, an agency's homepage that lists the business as a client, a dental clinic matched on the map to a clothes shop called "Santral", a hotel whose site answers only on plain http.

Round 4 went looking for the limits on purpose: 12 online shops typed by bare name only, no city, no domain. It scored 52%. Typed as just "Shout" or "Loky", the agent took a US streaming service, an AI company, a place in Massachusetts and a village in Madagascar for Turkish shops (7 of its 11 wrong claims). The fix was again in the evidence, not the prompt: with a bare name, a site must name exactly the business or its address must be the whole name ("Shout! TV" and "Loky AI" are possible namesakes, so the report says "not settled"); a one-word name found on the map with no city is not tied to the business; "Ankara Pet" is not "Pet Ankara". Round 5, same list: 90%, no foreign namesakes left.

Then we found the bigger lever was not the model but the search. For 6 of the 9 businesses with a known site, that site was simply not among Tavily's 5 results for "name official website phone" in our comparison run, so no model could have picked it. The plain name with 10 results found it in 8 of 9 cases, at the same cost. Finding more sites also brought more namesakes and "launching soon" pages (round 6 fell to 71%), so four more guards followed: with only a name typed, identity is checked against that name, not the planner's tidier one ("Lost Mind" had become "Lost Minds", a games company); one common word is never told "no website of its own"; Turkish placeholder pages ("Yakında Başlatılacak") are recognised; a template's 212 123 45 67 is not a phone. Round 7, same list: 21 of 21 checkable kept claims correct.

Our biggest lesson came last. Rounds 8–11 fixed every error on one fresh list until it reached 96%. We then ran the same agent on 12 businesses it had never seen (round 12) and it fell to **61%**: it took a script that jumps to a parking page and an empty page for shops' websites, reported a US fabrics company and a shop in Ukraine for a Turkish seller called "MK Collection", matched a South Carolina boutique on the map under a city the planner had guessed, and told a seller whose domain answers 404 that the site was "secure". The fixes had fitted the list. Each cause got a guard and a test: an empty or parked page is never a website; with a bare name, a site must be tied to the business by search or to Turkey (a .tr address, Turkish text, a lira price, a +90 number), and a common name like "MK Collection" must link to the business's own Instagram or Shopier page; only a city the user typed ties a map match; "secure HTTPS" needs a page that loads. Round 13 re-measured the same list (91%), and round 14, a third list nobody had looked at, kept no wrong claim. Since then, every fix is measured on businesses it was not made for. The price is honest too: when the agent cannot tie a site to the business it says "not settled", so some reports are shorter.

Recording real Nemotron answers for the examples also caught a live bug: the Nano rewrite spent most of its 1,200-token budget thinking and returned nothing in 2 of 4 Turkish runs. The budgets are now set per call, with a test.

Other challenges: Cloudflare Workers has no system DNS resolver and no raw TLS certificate API, so DNS uses DNS-over-HTTPS and certificate expiry comes from Certificate Transparency logs, behind a small adapter. Live search had to be rate-limited to protect a small trial credit. And the page had to make sense to someone who has never heard of a "proof gate", which led to the guided tour and plain error messages.

## Accomplishments that we're proud of

- The model's mistakes are visible, not hidden: dropped claims stay on screen with the exact check that failed.
- Every claim can be re-proven by the user with one click.
- Fixes for real failures went into the evidence and the gate, not into a longer prompt, and each one has a regression test.
- Accuracy is measured on real businesses and published with every verdict, including the claims it got wrong.
- Every Nemotron call is accounted for on screen: tokens, latency and what code did with the answer, also in the free examples, which replay real recorded Nemotron answers.
- A stress test that went badly (52%) was published, fixed and re-measured until no kept claim was wrong (round 7), not hidden; so was the round in between that got worse (71%).
- When fixes that scored 96% on one list fell to 61% on a fresh one, we published that too, found the four causes and reached a fresh list with no wrong kept claim (round 14); the next three fresh lists (rounds 16, 18 and 19) kept 91 of 96 right, each error turned into a fix or a named limit.
- We set four separate AI review agents to break it, reproduced what they found and fixed 16 of 17 issues, each with a test.
- It runs end to end with zero dependencies, locally or on a free Workers plan.

## What we learned

- A gate is only as good as what its checks are about. Our checks were correct; they were checking the wrong website. Identity has to be proven before anything else.
- Provenance matters as much as correctness: a value the model only invented should not reach a check at all.
- Splitting work between a reasoning model (Super) and a small fast model (Nano) works well when the small model's output is checked by a simple rule.
- The hardest input is the shortest one. A bare name is ambiguous, and the honest answer is sometimes "not settled" rather than a guess.
- Measure the inputs before blaming the model: a better search query did more than a 550B model.
- A score on the list you fixed is not accuracy. Only businesses the fixes were never made for tell you how the agent will do tomorrow.

## Accuracy

The live agent runs on lists of 12 real Turkish small businesses; every claim the gate keeps is then checked by hand outside Proofline (DNS, curl, openssl, the full homepage, OpenStreetMap, web search).

| Round | Businesses | Proposed | Dropped by the gate | Kept | Kept and correct | Accuracy of kept claims |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (8 Oct) | 12 online shops | 40 | 7 | 33 | 24 | 73% |
| 2 (8 Oct, after fixes) | same 12 | 39 | 6 | 33 | 29 | 88% |
| 3 (11 Oct, after fixes) | 12 new local businesses: venues, hotels, clinics | 26 | 5 | 21 | 18 | 86% |
| 4 (12 Oct, stress test) | 12 new online shops, bare name only | 27 | 1 | 26 | 12 of 23 checkable | 52% |
| 5 (12 Oct, after fixes) | same 12, bare names | 25 | 3 | 22 | 18 of 20 checkable | 90% |
| 6 (12 Oct, new search) | same 12, bare names | 34 | 4 | 30 | 17 of 24 checkable | 71% |
| 7 (12 Oct, new search + guards) | same 12, bare names | 30 | 4 | 26 | 21 of 21 checkable | 100% |
| 8 (12 Oct, no fixes in between) | 12 new online shops, mixed input | 24 | 1 | 23 | 21 of 23 | 91% |
| 9–11 (14 Oct, after fixes) | same 12 | 27–28 | 2–3 | 24–25 | 22–23 of 24 | 92–96% |
| 12 (14 Oct, fixes tested on new businesses) | 12 new shops, mixed input | 35 | 1 | 34 | 20 of 33 checkable | 61% |
| 13 (14 Oct, after fixes) | same 12 | 28 | 6 | 22 | 20 of 22 | 91% |
| 14 (14 Oct, after one more guard) | 12 new shops, mixed input | 25 | 5 | 20 | 18 of 18 checkable | 100% |
| 15 (14 Oct, lost findings won back) | same 12 | 26 | 3 | 23 | 23 of 23 | 100% |
| 16 (14 Oct, no fixes in between) | 12 new shops and makers, mixed input | 33 | 0 | 33 | 32 of 33 | 97% |
| 17 (15 Oct, after fixes) | same 12 | 35 | 0 | 35 | 35 of 35 | 100% |
| 18 (15 Oct, after the audit fixes) | 12 new shops, mixed input | 33 | 0 | 33 | 32 of 33 | 97% |
| 19 (16 Oct, after one more fix) | 12 new shops, mixed input | 32 | 2 | 30 | 27 of 30 | 90% |

The honest numbers are the rounds on businesses the earlier fixes were not made for: 3 (86%), 8 (91%), 12 (61%), 14 (100%), 16 (97%), 18 (97%) and 19 (90%). The last fresh-list errors all came from what a business's own pages say: a shop whose site's address leaves out "Elektronik" and whose title is a slogan (round 18); a shop whose site only its map entry links, and a chain told it "may have closed" because one branch's map entry says so while its site sells and lists four open stores (round 19). Those are fixed; one remains a named limit (a shop on the map under its other brand name). Rounds re-run on the same list (2, 5–7, 9–11, 13, 15, 17) show the effect of each change, not a fresh sample. A claim the check could not settle is left out of the percentage and listed. The method, every verdict and every error are in `docs/accuracy.md`.

## What's next

- Recognise a business listed on the map under an older name, by comparing the map entry's phone or website with the site's (round 3's one unfixed error).
- Find a shop whose website has another name, through the links on its Instagram or marketplace page (round 5's known limit).
- More Tavily signals: relocation / "moved", and a dedicated identity-verification search.
- Keep measuring every new fix on a fresh list of businesses it was not made for, as in rounds 12–19, and keep winning back the true findings the caution leaves out (round 15 recovered two: a city named only on the contact page, a brand's Turkish site behind its US store; round 17 recovered a site that names its city once, deep in a 1.4 MB page).
- Batch mode for a seller's lead list.

## What was built during the hackathon

Proofline is a new project. The repository's first commit is on 6 October 2026, inside the submission period, and all code, tests, the interface, the Workers demo and the video were made during the hackathon. The idea comes from our earlier, separate sales tool, which is not part of this submission; this repository was written from scratch.

## Built with

javascript, node.js, nvidia-nemotron, nemotron-3-super, nemotron-3-nano, nebius-token-factory, structured-output, tavily, cloudflare-workers, durable-objects, openstreetmap, server-sent-events

## Links

- Live demo: https://proofline-demo.dwelltime-yayin.workers.dev
- Code (MIT): https://github.com/jpalii77/proofline
- Video (2:00): https://youtu.be/20kavMVwN70
