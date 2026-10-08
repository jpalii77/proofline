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

The public demo opens with four recorded, fictional examples (instant, free) and a capped live mode that calls Tavily and Nemotron for real. The interface is in **English and Turkish**, and an optional four-step **"How it works" tour** explains the page to a first-time visitor.

## How we built it

- **Runtime:** plain Node.js 20+, zero dependencies. Public demo on Cloudflare Workers, with a SQLite-backed Durable Object for daily quotas, a 24-hour query cache and share links.
- **NVIDIA Nemotron on Nebius Token Factory:** every model call goes to Token Factory's OpenAI-compatible Chat Completions API at runtime, with plain `fetch` and strict JSON (`src/llm.mjs`; prompts in `src/agent/nemotron-brain.mjs`).
  - **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`, reasoning tier): planner, claim proposer and writer.
  - **Nemotron 3 Nano** (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, fast tier): plain-language rewrites, checked by `numbersGrounded` in `src/agent/pipeline.mjs`.
  - Token counts come from the API's `usage` field (`parseUsage`); a missing field is shown as unknown, never estimated.
- **Tavily** (`src/tavily.mjs`, `POST /search` at runtime):
  1. discovery: the only source the planner may take a domain or phone from;
  2. own-site identity: the same results decide whether a domain is really the business's own website or whether it only has listings;
  3. closure check: `"<name>" <city> permanently closed`, counted only if the same result names the business.
  The gate uses fresh I/O, so search-based claims are re-proven with a new Tavily call.
- **Guards in code:** grounding guard (domain and phone must come from search results, domain must have a real public-suffix ending), own-site guard (a listing platform is never "the website"), the gate (`gateClaim`), and a citation lint on the pitch.
- **Failure handling:** a failed model call, a time limit or a request limit turns the affected checks into "not checked", never into a finding. Server errors become a plain sentence, never a stack trace.
- **Interface:** single page, no framework; English and Turkish dictionary (`public/i18n.js`), guided tour (`public/tour.js`), phone layout.
- **Tests:** 138 `node:test` tests, no network needed, including crash tests for odd input, broken services and malformed requests. `SAMPLE_MODE` runs the whole agent on recorded fixtures with a labelled rule-based stand-in for the model, so anyone can try it without keys.

## Challenges we ran into

Our own agent made exactly the mistake Proofline exists to prevent. On 6 October 2026 we ran it live for the first time, on a real café in Ankara:

1. **Run 1:** Nemotron picked the café's page on a QR-menu platform as "its website" and proposed six confident claims about a site that was not theirs. The gate kept all six, because each check was technically true for the platform page. We fixed it at the evidence level: a list of listing platforms, an own-site identity check, and every website claim now starts its proof with that check.
2. **Run 2:** an address abbreviation in a search snippet was read as a domain. We added an offline public-suffix check and a provenance rule: only web addresses that appear in the search results count.
3. **Run 3:** correct. No website of its own, listings only.

The fictional "Kuzey Kafe" sample reproduces the first trap so anyone can watch the gate drop the claims made against the platform page.

Other challenges: Cloudflare Workers has no system DNS resolver and no raw TLS certificate API, so DNS uses DNS-over-HTTPS and certificate expiry comes from Certificate Transparency logs, behind a small adapter. Live search had to be rate-limited to protect a small trial credit. And the page had to make sense to someone who has never heard of a "proof gate", which led to the guided tour and plain error messages.

## Accomplishments that we're proud of

- The model's mistakes are visible, not hidden: dropped claims stay on screen with the exact check that failed.
- Every claim can be re-proven by the user with one click.
- Fixes for real failures went into the evidence and the gate, not into a longer prompt, and each one has a regression test.
- Every Nemotron call is accounted for on screen: tokens, latency and what code did with the answer.
- It runs end to end with zero dependencies, locally or on a free Workers plan.

## What we learned

- A gate is only as good as what its checks are about. Our checks were correct; they were checking the wrong website. Identity has to be proven before anything else.
- Provenance matters as much as correctness: a value the model only invented should not reach a check at all.
- Splitting work between a reasoning model (Super) and a small fast model (Nano) works well when the small model's output is checked by a simple rule.

## Accuracy

Measurement in progress (October 2026). The live agent runs on a list of real businesses and every kept claim is checked independently; results will be in `docs/accuracy.md` in the repository. <!-- ACCURACY: fill after the measurement; no numbers before the independent check -->

## What's next

- Agent report text (claims, findings, drop reasons) in the visitor's language; today only the interface is bilingual.
- More Tavily signals: relocation / "moved", and a dedicated identity-verification search.
- Nemotron 3 Ultra for the hardest planning decisions, if credit allows.
- Record real Nemotron outputs for the sample fixtures, replacing the rule-based stand-in.
- Batch mode for a seller's lead list.

## What was built during the hackathon

Proofline is a new project. The repository's first commit is on 6 October 2026, inside the submission period, and all code, tests, the interface, the Workers demo and the video were made during the hackathon. The idea comes from our earlier, separate sales tool, which is not part of this submission; this repository was written from scratch.

## Built with

javascript, node.js, nvidia-nemotron, nemotron-3-super, nemotron-3-nano, nebius-token-factory, tavily, cloudflare-workers, durable-objects, openstreetmap, server-sent-events

## Links

- Live demo: https://proofline-demo.dwelltime-yayin.workers.dev
- Code (MIT): https://github.com/jpalii77/proofline
- Video: VIDEO_URL (replace after the YouTube upload)
