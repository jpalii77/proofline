// The unit a reader acts on is a report, not a claim: one false sentence in a message to a business owner
// ("your site is down" when it is not) spoils the whole message. From the 19 measured rounds this counts, per
// business report, whether it carried at least one wrong claim, with the gate (what was shown) and without it
// (every claim Nemotron proposed). No network, no keys: it only reads files already in the repository.
//   node scripts/report-impact.mjs            -> tables in Markdown
//   node scripts/report-impact.mjs --json     -> the numbers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** First run of every list (a list the fixes were not made for yet); later rounds re-run a list after fixes. */
export const FRESH_ROUNDS = [1, 3, 4, 8, 12, 14, 16, 18, 19];
/** The four fresh lists measured after the round-13 guards; the landing page's 96% comes from them. */
export const LAST_FRESH = [14, 16, 18, 19];

/** A verdict note starts with its mark: "right …", "wrong: …"/"WRONG: …", "unverifiable …". */
export function mark(note) {
  const t = typeof note === 'string' ? note : '';
  if (/^right\b/i.test(t)) return 'right';
  if (/^wrong\b/i.test(t)) return 'wrong';
  return 'unsettled';
}

/** Per business in one round: wrong claims it was shown, and wrong claims the gate removed from it. */
export function roundReports(run, verdicts, droppedLabels) {
  return run.results.map((x) => {
    const notes = verdicts.verdicts[x.id] || {};
    const shown = (x.verified || []).map((c) => mark(notes[c.type]));
    const removedWrong = droppedLabels.filter((d) => d.business === x.id && d.truth === 'false').length;
    const shownWrong = shown.filter((m) => m === 'wrong').length;
    return {
      business: x.id,
      shown: shown.length,
      shownWrong,
      removedWrong,
      withGate: shownWrong > 0 ? 'wrong' : 'clean',
      withoutGate: shownWrong + removedWrong > 0 ? 'wrong' : 'clean',
    };
  });
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

/** Totals over a set of rounds: reports, and how many carried at least one wrong claim with and without the gate. */
export function tally(rounds, pick = null) {
  const rs = pick ? rounds.filter((r) => pick.includes(r.round)) : rounds;
  const reports = rs.flatMap((r) => r.reports);
  const withGate = reports.filter((p) => p.withGate === 'wrong').length;
  const withoutGate = reports.filter((p) => p.withoutGate === 'wrong').length;
  return {
    rounds: rs.map((r) => r.round),
    reports: reports.length,
    withGate,
    withoutGate,
    cleanWithGate: pct(reports.length - withGate, reports.length),
    cleanWithoutGate: pct(reports.length - withoutGate, reports.length),
  };
}

export function load() {
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'gate-ablation.json'), 'utf8'));
  const rounds = labels.rounds.map((r) => {
    const run = JSON.parse(fs.readFileSync(path.join(root, r.run), 'utf8'));
    const verdicts = JSON.parse(fs.readFileSync(path.join(root, r.verdicts), 'utf8'));
    return { round: r.round, reports: roundReports(run, verdicts, r.dropped) };
  });
  return {
    rounds: rounds.map((r) => ({ round: r.round, ...tally([r]) })),
    all: tally(rounds),
    fresh: tally(rounds, FRESH_ROUNDS),
    lastFresh: tally(rounds, LAST_FRESH),
    firstFresh: tally(rounds, [1]),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = load();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(a, null, 2));
  } else {
    const row = (label, t) => `| ${label} | ${t.reports} | ${t.withGate} (${t.cleanWithGate}% clean) | ${t.withoutGate} (${t.cleanWithoutGate}% clean) |`;
    console.log('| Rounds | Business reports | With at least one wrong claim, with the gate | Without the gate |');
    console.log('| --- | --- | --- | --- |');
    console.log(row('Round 1 (first list, first run)', a.firstFresh));
    console.log(row(`First run of every fresh list (rounds ${FRESH_ROUNDS.join(', ')})`, a.fresh));
    console.log(row(`Last four fresh lists (rounds ${LAST_FRESH.join(', ')})`, a.lastFresh));
    console.log(row('All 19 rounds', a.all));
    console.log('\n| Round | Reports | Wrong with the gate | Wrong without the gate |');
    console.log('| --- | --- | --- | --- |');
    for (const r of a.rounds) console.log(`| ${r.round} | ${r.reports} | ${r.withGate} | ${r.withoutGate} |`);
  }
}
