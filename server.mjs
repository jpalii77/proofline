// Zero-dependency HTTP server: static UI + Server-Sent Events stream of the agent trace.
//   GET  /api/config            public setup (sample mode, model names, sample list)
//   GET  /api/run?q=...         SSE: one event per agent step, final "done" carries the report
//   POST /api/recheck           { runId, claimId } -> re-runs that claim's proof right now

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from './src/agent/pipeline.mjs';
import { gateClaim } from './src/claims.mjs';
import { observed } from './src/io/observed.mjs';
import { configProblem, publicConfig, readConfig, wiringFor } from './src/runtime.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// pace: in sample mode, add realistic latency so the trace streams like a live run (off in tests).
export function createServer(cfg = readConfig(), { fetchImpl, pace = false } = {}) {
  const runs = new Map(); // runId -> { io, claims }
  let live = 0;

  function remember(id, value) {
    runs.set(id, value);
    if (runs.size > 50) runs.delete(runs.keys().next().value);
  }

  function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:",
    });
    fs.createReadStream(file).pipe(res);
  }

  async function handleRun(req, res, url) {
    const q = (url.searchParams.get('q') || '').slice(0, 200);
    const wiring = q ? wiringFor(cfg, q, { fetchImpl, pace }) : { error: 'Enter a business name or a domain.' };
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    const send = (e) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    if (wiring.error) { send({ type: 'error', message: wiring.error }); return res.end(); }
    if (!cfg.sampleMode && live >= 2) { send({ type: 'error', message: 'Busy with other checks. Try again in a minute.' }); return res.end(); }

    const runId = Math.random().toString(36).slice(2, 10);
    if (!cfg.sampleMode) live++;
    try {
      send({ type: 'run', runId });
      const out = await runAgent({ query: wiring.query, io: wiring.io, brain: wiring.brain, emit: send });
      if (out.report) remember(runId, { io: wiring.io, claims: [...out.report.verified, ...out.report.dropped] });
    } catch (err) {
      send({ type: 'error', message: `Agent failed: ${err.message}` });
    } finally {
      if (!cfg.sampleMode) live--;
      res.end();
    }
  }

  async function handleRecheck(req, res) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 2000) break; }
    let input;
    try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
    const run = runs.get(input.runId);
    const claim = run?.claims.find((c) => c.id === input.claimId);
    if (!claim) return json(res, 404, { error: 'Run expired. Start a new check.' });
    const { evidence, verdict, dropReason, ...plain } = claim; // eslint-disable-line no-unused-vars
    const again = await gateClaim(observed(run.io), plain);
    return json(res, 200, { id: again.id, verdict: again.verdict, dropReason: again.dropReason, evidence: again.evidence, checkedAt: again.checkedAt });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, publicConfig(cfg));
      if (req.method === 'GET' && url.pathname === '/api/run') return await handleRun(req, res, url);
      if (req.method === 'POST' && url.pathname === '/api/recheck') return await handleRecheck(req, res);
      if (req.method === 'GET') return serveStatic(req, res, url.pathname);
      json(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message });
      else res.end();
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cfg = readConfig();
  const problem = configProblem(cfg);
  if (problem) { console.error(`Proofline cannot start in live mode.\n${problem}`); process.exit(1); }
  createServer(cfg, { pace: !process.argv.includes('--fast') }).listen(cfg.port, () => {
    const mode = cfg.sampleMode ? 'SAMPLE_MODE (recorded data, no keys)' : `live · ${cfg.nebius.reasoningModel}`;
    console.log(`Proofline on http://localhost:${cfg.port}  [${mode}]`);
  });
}
