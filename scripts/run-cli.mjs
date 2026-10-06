// Run the agent from the terminal: npm run cli -- "Lumen Coffee Roasters, Izmir"
import { runAgent } from '../src/agent/pipeline.mjs';
import { configProblem, readConfig, wiringFor } from '../src/runtime.mjs';

const query = process.argv.slice(2).join(' ') || 'Lumen Coffee Roasters, Izmir';
const cfg = readConfig();
const problem = configProblem(cfg);
if (problem) { console.error(problem); process.exit(1); }
const w = wiringFor(cfg, query);
if (w.error) { console.error(w.error); process.exit(1); }

const mark = { true: 'PASS', false: 'FAIL', null: '??? ' };
const { report, error } = await runAgent({
  query: w.query, io: w.io, brain: w.brain,
  emit: (e) => {
    if (e.type === 'plan') console.log(`plan     ${e.model}: ${JSON.stringify(e.ctx)}${e.guard.length ? `  guard: ${e.guard.join('; ')}` : ''}`);
    if (e.type === 'observe') console.log(`observe  ${mark[e.pass]} ${e.check}  ${e.summary}`);
    if (e.type === 'gate') console.log(`gate     ${e.verdict === 'verified' ? 'KEEP' : 'DROP'} ${e.claimType}${e.dropReason ? `  (${e.dropReason})` : ''}`);
    if (e.type === 'write') console.log(`write    kept ${e.kept} finding(s), removed ${e.removed.length}`);
  },
});
if (error) process.exit(1);
console.log(`\ncard     ${report.card.grade} (${report.card.overall})  ` + Object.values(report.card.areas).map((a) => `${a.label} ${a.grade}`).join(' · '));
console.log(`stats    ${JSON.stringify(report.stats)}`);
