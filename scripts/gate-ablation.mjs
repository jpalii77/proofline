// What if there were no gate? Every claim the model proposed would have been shown. From the 19 measured
// rounds (docs/accuracy.md) and the independent verdict on every claim the gate dropped
// (eval/gate-ablation.json), this counts how many right and wrong claims a reader would have seen with and
// without the gate. No network, no keys: it only reads files already in the repository.
//   node scripts/gate-ablation.mjs            -> table in Markdown
//   node scripts/gate-ablation.mjs --json     -> the numbers
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Rows of the results table in docs/accuracy.md: round, proposed, dropped, kept, right, checkable. */
export function accuracyRows(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const m = /^\| (\d+) \| [^|]+\| \d+ \| (\d+) \| (\d+) \| (\d+) \| ([^|]+)\|/.exec(line);
    if (!m) continue;
    const cell = m[5].trim();
    const of = /(\d+) of (\d+)/.exec(cell);
    const right = Number(of ? of[1] : cell);
    const checkable = of ? Number(of[2]) : Number(m[4]);
    rows.push({ round: Number(m[1]), proposed: Number(m[2]), dropped: Number(m[3]), kept: Number(m[4]), right, checkable });
  }
  return rows;
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

/** With the gate a reader sees the kept claims; without it, every proposed claim. Unsettled claims are left out. */
export function ablation(rows, labels) {
  const byRound = new Map(labels.rounds.map((r) => [r.round, r.dropped]));
  const out = rows.map((r) => {
    const drops = byRound.get(r.round) || [];
    const count = (t) => drops.filter((d) => d.truth === t).length;
    const droppedWrong = count('false');
    const droppedRight = count('true');
    // a dropped claim the round's file does not list is counted as unsettled, never as a win for the gate
    const droppedUnknown = count('unknown') + Math.max(0, r.dropped - drops.length);
    const keptWrong = r.checkable - r.right;
    return {
      round: r.round,
      gate: { right: r.right, wrong: keptWrong, accuracy: pct(r.right, r.checkable) },
      noGate: { right: r.right + droppedRight, wrong: keptWrong + droppedWrong, accuracy: pct(r.right + droppedRight, r.checkable + droppedRight + droppedWrong) },
      dropped: { wrong: droppedWrong, right: droppedRight, unknown: droppedUnknown },
    };
  });
  const sum = (pick) => out.reduce((n, r) => n + pick(r), 0);
  const total = {
    gate: { right: sum((r) => r.gate.right), wrong: sum((r) => r.gate.wrong) },
    noGate: { right: sum((r) => r.noGate.right), wrong: sum((r) => r.noGate.wrong) },
    dropped: { wrong: sum((r) => r.dropped.wrong), right: sum((r) => r.dropped.right), unknown: sum((r) => r.dropped.unknown) },
  };
  total.gate.accuracy = pct(total.gate.right, total.gate.right + total.gate.wrong);
  total.noGate.accuracy = pct(total.noGate.right, total.noGate.right + total.noGate.wrong);
  total.wrongRemoved = pct(total.dropped.wrong, total.noGate.wrong);
  return { rounds: out, total };
}

export function load() {
  const md = fs.readFileSync(path.join(root, 'docs', 'accuracy.md'), 'utf8');
  const labels = JSON.parse(fs.readFileSync(path.join(root, 'eval', 'gate-ablation.json'), 'utf8'));
  return ablation(accuracyRows(md), labels);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = load();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(a, null, 2));
  } else {
    console.log('| Round | With the gate: right / wrong | Without the gate: right / wrong | Dropped: wrong / true / unsettled |');
    console.log('| --- | --- | --- | --- |');
    for (const r of a.rounds) {
      console.log(`| ${r.round} | ${r.gate.right} / ${r.gate.wrong} (${r.gate.accuracy}%) | ${r.noGate.right} / ${r.noGate.wrong} (${r.noGate.accuracy}%) | ${r.dropped.wrong} / ${r.dropped.right} / ${r.dropped.unknown} |`);
    }
    const t = a.total;
    console.log(`| **All 19** | **${t.gate.right} / ${t.gate.wrong} (${t.gate.accuracy}%)** | **${t.noGate.right} / ${t.noGate.wrong} (${t.noGate.accuracy}%)** | **${t.dropped.wrong} / ${t.dropped.right} / ${t.dropped.unknown}** |`);
    console.log(`\nThe gate removed ${t.dropped.wrong} of the ${t.noGate.wrong} wrong claims the model proposed (${t.wrongRemoved}%), at the cost of ${t.dropped.right} true claims.`);
  }
}
