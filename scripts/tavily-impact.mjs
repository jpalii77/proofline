// Where Tavily decides what a report says. A kept claim is "Tavily-backed" when its proof ran a check that reads
// Tavily results: site.own_site (unless the user typed the domain), web.own_site_found, web.no_closure_signal.
// From the 19 measured rounds this counts those claims and how many were right, against claims proven without
// Tavily, and the claims the gate dropped because a Tavily-backed check failed. No network, no keys: it only
// reads files already in the repository (same rounds and labels as scripts/report-impact.mjs).
//   node scripts/tavily-impact.mjs            -> tables in Markdown
//   node scripts/tavily-impact.mjs --json     -> the numbers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAST_FRESH, mark } from './report-impact.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEARCH_CHECKS = new Set(['web.own_site_found', 'web.no_closure_signal']);

/** True when this piece of evidence came from a check that reads Tavily results. */
export function usesTavily(ev) {
  if (!ev) return false;
  if (SEARCH_CHECKS.has(ev.check)) return true;
  return ev.check === 'site.own_site' && !ev.params?.userGiven && !ev.observed?.userGiven;
}

const zero = () => ({ right: 0, wrong: 0, unsettled: 0 });

/** One round: kept claims split by Tavily-backed or not (with their marks), and Tavily-decided drops by label. */
export function roundTavily(run, verdicts, droppedLabels) {
  const tavily = zero();
  const other = zero();
  const noSite = zero();
  const drops = { rightlyDropped: 0, wronglyDropped: 0, unknown: 0 };
  for (const x of run.results) {
    for (const c of x.verified || []) {
      const m = mark((verdicts.verdicts[x.id] || {})[c.type]);
      ((c.evidence || []).some(usesTavily) ? tavily : other)[m]++;
      if (c.type === 'no_own_website') noSite[m]++;
    }
    for (const c of x.dropped || []) {
      const failed = (c.evidence || []).filter((e) => e.matched === false);
      if (!failed.some(usesTavily)) continue;
      const t = droppedLabels.find((d) => d.business === x.id && d.type === c.type)?.truth;
      if (t === 'false') drops.rightlyDropped++;
      else if (t === 'true') drops.wronglyDropped++;
      else drops.unknown++;
    }
  }
  return { tavily, other, noSite, drops };
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const add = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]));

/** Sums over a set of rounds, with the share right among checkable (right + wrong) claims. */
export function tallyTavily(rounds, pick = null) {
  const rs = pick ? rounds.filter((r) => pick.includes(r.round)) : rounds;
  const sum = rs.reduce(
    (s, r) => ({ tavily: add(s.tavily, r.tavily), other: add(s.other, r.other), noSite: add(s.noSite, r.noSite), drops: add(s.drops, r.drops) }),
    { tavily: zero(), other: zero(), noSite: zero(), drops: { rightlyDropped: 0, wronglyDropped: 0, unknown: 0 } },
  );
  const share = (t) => ({ ...t, kept: t.right + t.wrong + t.unsettled, rightPct: pct(t.right, t.right + t.wrong) });
  return { rounds: rs.map((r) => r.round), tavily: share(sum.tavily), other: share(sum.other), noSite: share(sum.noSite), drops: sum.drops };
}

/** The first seven rounds: the first three lists, before the identity guards of rounds 8–13. */
export const EARLY = [1, 2, 3, 4, 5, 6, 7];

export function load() {
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'gate-ablation.json'), 'utf8'));
  const rounds = labels.rounds.map((r) => {
    const run = JSON.parse(fs.readFileSync(path.join(root, r.run), 'utf8'));
    const verdicts = JSON.parse(fs.readFileSync(path.join(root, r.verdicts), 'utf8'));
    return { round: r.round, ...roundTavily(run, verdicts, r.dropped) };
  });
  return { all: tallyTavily(rounds), early: tallyTavily(rounds, EARLY), lastFresh: tallyTavily(rounds, LAST_FRESH) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = load();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(a, null, 2));
  } else {
    const cell = (t) => `${t.right} of ${t.right + t.wrong} (${t.rightPct}%)`;
    console.log('| Rounds | Tavily-backed kept claims: right of checkable | Claims proven without Tavily | "No website of its own" | Gate drops decided by a Tavily check: rightly / wrongly / unknown |');
    console.log('| --- | --- | --- | --- | --- |');
    const row = (label, t) => `| ${label} | ${cell(t.tavily)} | ${cell(t.other)} | ${cell(t.noSite)} | ${t.drops.rightlyDropped} / ${t.drops.wronglyDropped} / ${t.drops.unknown} |`;
    console.log(row(`Rounds ${EARLY[0]}–${EARLY.at(-1)} (first three lists)`, a.early));
    console.log(row(`Last four fresh lists (rounds ${LAST_FRESH.join(', ')})`, a.lastFresh));
    console.log(row('All 19 rounds', a.all));
  }
}
