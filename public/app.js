// Proofline UI. Plain DOM, no framework. All text from the server is set with textContent.

const $ = (s) => document.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const TOOL_LABEL = { dnsLookup: 'DNS', fetchPage: 'HTTP', tlsCert: 'TLS', nominatim: 'OSM', search: 'Tavily' };
const STAGE_OF = { plan: 'plan', discover: 'plan', observe: 'observe', tool: 'observe', propose: 'propose', gate: 'gate', verify: 'verify', write: 'write' };
const ORDER = ['plan', 'observe', 'propose', 'gate', 'verify', 'write'];
const WORKING = {
  plan: 'Searching the web and identifying the business…',
  observe: 'Running the evidence checks…',
  propose: 'Proposing claims from the evidence…',
  gate: 'The gate is re-running every claim’s proof from scratch…',
  verify: 'Rewriting verified claims for the owner…',
  write: 'Writing the summary and a cited pitch…',
};
const OUTCOME = { accepted: 'accepted', partial: 'partly rejected', rejected: 'rejected', failed: 'no answer' };
const SHARE_PATH = /^\/r\/([a-z0-9]{12})\/?$/;

let source = null;
let runId = null;
let timer = null;
let run = null; // { events, share, report, ended }

let demo = null;
const liveMode = () => !!demo && document.querySelector('input[name="mode"]:checked')?.value === 'live';
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const secs = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

function setLeft(n) {
  if (!demo?.live) return;
  demo.left = n;
  $('#left').textContent = n > 0 ? `${n} left today · Nemotron + Tavily` : 'quota used up today';
}

function setModeNote() {
  const note = $('#mode-note');
  if (!demo) return;
  note.hidden = false;
  if (!liveMode()) note.textContent = 'Recorded mode replays four fictional businesses, each with a planted wrong claim for the gate to catch. Pick one below.';
  else if (!demo.live) note.textContent = 'Live mode is not configured on this demo yet — try a recorded example.';
  else note.textContent = `Live search calls NVIDIA Nemotron on Nebius Token Factory and Tavily for real. To protect a small trial credit: ${demo.limits.perVisitor} checks per visitor and ${demo.limits.perDay} in total per day; the same query within ${demo.limits.cacheHours} h is answered from cache.`;
  $('#q').placeholder = liveMode() ? 'Name, city — or a domain' : 'Pick an example below';
}

async function boot() {
  const shared = SHARE_PATH.exec(location.pathname);
  if (shared) return openShared(shared[1]);
  const cfg = await fetch('/api/config').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const mode = $('#mode');
  if (!cfg) {
    mode.textContent = 'offline';
    $('#samples').replaceChildren(h('p', { class: 'samples-note', role: 'alert' }, 'The demo server did not answer. Check your connection and reload the page.'));
    return;
  }
  demo = cfg.demo || null;
  if (demo) {
    mode.textContent = demo.live ? 'Public demo · recorded + limited live search' : 'Public demo · recorded examples';
    $('#modes').hidden = false;
    if (!demo.live) $('#left').textContent = 'not configured yet';
    else setLeft(demo.left);
    document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', setModeNote));
  } else if (cfg.sampleMode) mode.textContent = 'Sample mode · recorded data, no keys';
  else { mode.textContent = `Live · ${cfg.models.reasoning} on Nebius Token Factory${cfg.tavily ? ' · Tavily' : ''}`; mode.classList.add('live'); }
  const box = $('#samples');
  for (const s of cfg.samples) {
    box.append(h('button', { type: 'button', class: 'chip', onclick: () => {
      if (demo) { document.querySelector('input[name="mode"][value="sample"]').checked = true; setModeNote(); }
      $('#q').value = s.input; start(s.input);
    } }, h('b', {}, s.input), h('small', {}, s.blurb)));
  }
  if (!cfg.sampleMode || demo) box.prepend(h('p', { class: 'samples-note' }, 'Recorded examples (fictional businesses):'));
  const params = new URLSearchParams(location.search);
  if (demo && params.get('live') === '1') document.querySelector('input[name="mode"][value="live"]').checked = true;
  setModeNote();
  const q = params.get('q');
  if (q) { $('#q').value = q; start(q); }
}

$('#form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q) start(q); else $('#q').focus(); });

function setStage(stage) {
  const i = ORDER.indexOf(stage);
  document.querySelectorAll('#stages li').forEach((li) => {
    const j = ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('done', j < i);
    li.classList.toggle('active', j === i);
  });
  const ph = $('#report .placeholder p');
  if (ph && WORKING[stage]) ph.textContent = WORKING[stage];
}

function event(tag, body, cls = '') {
  const li = h('li', { class: `ev ${cls}` }, h('span', { class: 'tag' }, tag), h('div', { class: 'body' }, body));
  const list = $('#events');
  list.append(li);
  list.scrollTop = list.scrollHeight;
}

const markOf = (pass) => (pass === true ? h('span', { class: 'mark ok', 'aria-label': 'pass' }, '✓') : pass === false ? h('span', { class: 'mark no', 'aria-label': 'fail' }, '✗') : h('span', { class: 'mark na', 'aria-label': 'not checked' }, '?'));

function tokensText(u) {
  if (!u) return 'tokens not reported';
  return `${fmt(u.in)} in → ${fmt(u.out)} out tokens${u.reasoning ? ` (${fmt(u.reasoning)} reasoning)` : ''}`;
}

// One handler per trace event. Used by the live stream and by the shared-report replay.
const HANDLERS = {
  run: (e) => { runId = e.runId; if (typeof e.left === 'number') setLeft(e.left); },
  cached: (e) => event('cache', [h('b', {}, 'Answered from cache'), h('span', { class: 'meta' }, `same query ran live ${e.ageMinutes < 60 ? `${e.ageMinutes} min` : `${Math.round(e.ageMinutes / 60)} h`} ago · no new API calls · Re-run proof checks again now`)]),
  start: (e) => event('start', [h('b', {}, e.query), h('span', { class: 'meta' }, `reasoning: ${e.models.reasoning} · fast: ${e.models.fast}`)]),
  intake: (e) => event('intake', `Parsed as ${e.parsed.domain ? `domain ${e.parsed.domain}` : `“${e.parsed.name}”${e.parsed.city ? ` in ${e.parsed.city}` : ''}`}`),
  discover: (e) => event('tavily', [h('b', {}, `${e.results.length} web result(s)`), h('span', { class: e.error ? 'meta warn' : 'meta' }, e.error ? `search failed: ${e.error}` : e.query)]),
  plan: (e) => event('plan', [
    h('b', {}, e.ctx.domain || e.ctx.name),
    ` ${[e.ctx.city, e.ctx.phone].filter(Boolean).join(' · ')}`,
    e.reasoning ? h('span', { class: 'meta' }, e.reasoning) : null,
    ...e.guard.map((g) => h('span', { class: 'meta warn' }, `guard: ${g}`)),
  ]),
  model: (e) => event('model', [
    h('b', {}, `${e.role} · ${e.model}`),
    h('span', { class: 'meta' }, `${e.tier} · ${secs(e.ms || 0)} · ${tokensText(e.usage)}`),
    h('span', { class: `meta outcome o-${e.outcome}` }, `${OUTCOME[e.outcome] || e.outcome}${e.detail ? ` — ${e.detail}` : ''}`),
  ], `model o-${e.outcome}`),
  tool: (e) => { if (e.phase === 'gather') event(TOOL_LABEL[e.tool] || e.tool, h('span', { class: 'meta flat' }, `${shortArgs(e.args)} · ${e.ms} ms${e.error ? ` · ${e.error}` : ''}`)); },
  observe: (e) => event('check', [markOf(e.pass), h('b', {}, e.title), h('span', { class: 'meta' }, e.summary)], e.pass === true ? 'pass' : e.pass === false ? 'fail' : 'na'),
  propose: (e) => event('claims', [h('b', {}, `${e.claims.length} claim(s) to the gate`), e.rejected.length ? h('span', { class: 'meta' }, `${e.rejected.length} outside the catalog, refused`) : null]),
  gate: (e) => event(e.verdict === 'verified' ? 'kept' : 'dropped', [h('b', {}, e.statement), e.dropReason ? h('span', { class: 'meta' }, e.dropReason) : h('span', { class: 'meta' }, `${e.evidence.length} check(s) re-run, all matched`)], e.verdict === 'verified' ? 'pass' : 'fail drop'),
  verify: (e) => event('verify', [h('b', {}, e.skipped ? 'No verified claims to rewrite' : `${e.rewritten} owner line(s)`), e.rejected.length ? h('span', { class: 'meta warn' }, `${e.rejected.length} rewrite(s) rejected: ${e.rejected.map((r) => r.reason).join('; ')}`) : null]),
  write: (e) => event('write', [h('b', {}, e.failed ? 'Pitch not written' : `Pitch: ${e.kept} cited finding(s)`), e.removed.length ? h('span', { class: 'meta' }, `${e.removed.length} uncited sentence(s) removed`) : null]),
  done: (e) => {
    run.report = e.report;
    document.querySelectorAll('#stages li').forEach((li) => { li.classList.add('done'); li.classList.remove('active'); });
    renderReport(e.report);
  },
  share: (e) => { run.share = e; renderShare(); },
};

function dispatch(type, e) {
  if (!run) return;
  run.events.push(e);
  if (STAGE_OF[type]) setStage(STAGE_OF[type]);
  HANDLERS[type]?.(e);
}

function resetWorkspace(placeholder = 'Working. The report appears once every claim has been through the gate.') {
  if (source) source.close();
  clearInterval(timer);
  run = { events: [], share: null, report: null, ended: false };
  runId = null;
  $('#workspace').hidden = false;
  $('.trace').hidden = false;
  document.body.classList.add('ran');
  $('#events').replaceChildren();
  $('#clock').textContent = '0.0 s';
  $('#report').replaceChildren(h('div', { class: 'placeholder', role: 'status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, placeholder)));
  $('#report').setAttribute('aria-busy', 'true');
}

function start(query) {
  resetWorkspace();
  setStage('plan');
  $('#go').disabled = true;
  $('#go').textContent = 'Checking…';
  const t0 = performance.now();
  timer = setInterval(() => { $('#clock').textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`; }, 100);
  const live = liveMode();
  history.replaceState(null, '', `/?q=${encodeURIComponent(query)}${live ? '&live=1' : ''}`);
  if (window.matchMedia('(max-width: 880px)').matches) $('#workspace').scrollIntoView({ behavior: 'smooth' });

  const mine = run;
  source = new EventSource(`/api/run?q=${encodeURIComponent(query)}${live ? '&live=1' : ''}`);
  for (const type of Object.keys(HANDLERS)) {
    source.addEventListener(type, (m) => { if (run === mine) dispatch(type, JSON.parse(m.data)); });
  }
  source.addEventListener('error', (m) => {
    if (run !== mine) return;
    if (m.data) {
      const e = JSON.parse(m.data);
      if (!run.report) renderError(e.message, query);
      if (/live (quota|checks)/i.test(e.message)) setLeft(0);
    } else if (!run.report) {
      // The stream closed without a report: the host stopped the run (time or request limit) or the
      // connection dropped. Nothing was concluded, so nothing is shown as a finding.
      renderError('The run stopped before it finished (connection lost or the demo host’s time limit). Nothing was concluded from the checks that did not run.', query);
    }
    finish();
  });
}

function finish() {
  if (source) source.close();
  clearInterval(timer);
  $('#go').disabled = false;
  $('#go').textContent = 'Check it';
  $('#report').removeAttribute('aria-busy');
  if (run) run.ended = true;
}

function shortArgs(args) {
  const a = args[0];
  if (typeof a === 'string') return a.replace(/^https?:\/\//, '').slice(0, 60);
  return JSON.stringify(a).slice(0, 60);
}

// Errors that another try will not fix (wrong mode, quota, setup): no "Try again" button.
const FINAL_ERROR = /knows four fictional|enter a business|quota|checks for today|not configured|could not identify|expired or does not exist/i;

function renderError(msg, query) {
  const actions = [];
  if (query && !FINAL_ERROR.test(msg)) actions.push(h('button', { type: 'button', class: 'btn', onclick: () => start(query) }, 'Try again'));
  if (document.querySelector('#samples .chip')) actions.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => { $('#samples').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#samples .chip')?.focus({ preventScroll: true }); } }, 'Pick a recorded example'));
  const box = h('div', { class: 'error-box', role: 'alert' }, h('p', {}, msg), actions.length ? h('div', { class: 'actions' }, actions) : null);
  $('#report').replaceChildren(box);
  $('.trace').hidden = !run?.events.length;
  document.querySelectorAll('#stages li').forEach((li) => li.classList.remove('active'));
  $('#report').removeAttribute('aria-busy');
}

// ---- Model transparency ---------------------------------------------------------------------

// Older cached runs have no "model" events; rebuild what their trace did record (no token counts).
function legacyCalls(events) {
  const out = [];
  const role = { plan: ['Planner', 'reasoning'], propose: ['Claim proposer', 'reasoning'], verify: ['Owner rewrite', 'fast'], write: ['Writer', 'reasoning'] };
  for (const e of events) {
    if (!role[e.type] || !e.model) continue;
    let outcome = 'accepted';
    let detail = '';
    if (e.type === 'plan' && e.guard?.length) { outcome = 'partial'; detail = `guard: ${e.guard.join('; ')}`; }
    if (e.type === 'propose' && e.rejected?.length) { outcome = 'partial'; detail = `${e.rejected.length} outside the catalog`; }
    if (e.type === 'verify' && e.rejected?.length) { outcome = e.rewritten ? 'partial' : 'rejected'; detail = e.rejected.map((r) => r.reason).join('; '); }
    if (e.type === 'write' && e.removed?.length) { outcome = e.kept ? 'partial' : 'rejected'; detail = `${e.removed.length} sentence(s) removed by citation lint`; }
    out.push({ stage: e.type, role: role[e.type][0], tier: role[e.type][1], model: e.model, ms: e.ms || 0, usage: null, outcome, detail });
  }
  return out;
}

function modelSummary(r, calls) {
  const known = calls.filter((c) => c.usage);
  const tokens = known.length ? known.reduce((n, c) => n + (c.usage.total ?? ((c.usage.in || 0) + (c.usage.out || 0))), 0) : null;
  const n = calls.filter((c) => !c.skipped).length;
  const standIn = calls.length > 0 && calls.every((c) => /sample/.test(c.model));
  const parts = [`${n} model call${n === 1 ? '' : 's'}`, standIn ? 'rule-based stand-in, no tokens' : tokens == null ? 'tokens not reported' : `${fmt(tokens)} tokens`, `${r.stats.dropped} claim${r.stats.dropped === 1 ? '' : 's'} dropped by the gate`];
  if (r.stats.rewritesRejected) parts.push(`${r.stats.rewritesRejected} rewrite${r.stats.rewritesRejected === 1 ? '' : 's'} rejected`);
  return parts.join(' · ');
}

function modelPanel(r, calls) {
  const sample = calls.length > 0 && calls.every((c) => /sample/.test(c.model));
  return h('section', { class: 'block models', 'aria-labelledby': 'models-h' },
    h('div', { class: 'models-head' },
      h('h2', { id: 'models-h' }, 'Model calls'),
      h('p', {}, sample
        ? 'Recorded example: a rule-based stand-in plays the model, so no tokens are used. Live search runs the same steps on NVIDIA Nemotron via Nebius Token Factory.'
        : `Every NVIDIA Nemotron call on Nebius Token Factory in this run, and what the code checks did with its answer.${calls.length && !calls.some((c) => c.usage) ? ' Token counts were not recorded for this run.' : ''}`)),
    calls.length ? h('ol', { class: 'calls' }, calls.map((c) => h('li', { class: `call o-${c.outcome}` },
      h('div', { class: 'call-main' },
        h('b', {}, c.role),
        h('span', { class: 'tier' }, c.tier),
        h('code', {}, c.model)),
      h('div', { class: 'call-nums' },
        h('span', {}, secs(c.ms || 0)),
        h('span', {}, c.usage ? `${fmt(c.usage.in)} in` : 'tokens —'),
        c.usage ? h('span', {}, `${fmt(c.usage.out)} out`) : null),
      h('div', { class: 'call-out' },
        h('span', { class: `verdict o-${c.outcome}` }, OUTCOME[c.outcome] || c.outcome),
        c.detail ? h('span', { class: 'detail' }, c.detail) : null)))) : h('p', { class: 'muted' }, 'No model calls were recorded for this run.'));
}

// ---- Report ---------------------------------------------------------------------------------

function renderReport(r) {
  const card = r.card;
  const root = $('#report');
  root.replaceChildren();
  root.removeAttribute('aria-busy');
  const calls = r.models?.calls || legacyCalls(run?.events || []);
  const at = r.generatedAt || run?.events.find((e) => e.type === 'cached')?.at || null;

  root.append(h('section', { class: 'block card' },
    h('div', { class: 'biz' },
      h('div', {},
        h('h2', {}, 'Digital health card'),
        h('h3', {}, r.ctx.displayName || r.ctx.name || r.ctx.domain),
        h('div', { class: 'facts' }, [r.ctx.domain, r.ctx.city, r.ctx.phone].filter(Boolean).map((f) => h('span', {}, f))),
        at ? h('p', { class: 'generated' }, `Generated ${when(at)}`) : null),
      h('div', { class: 'overall' }, h('div', { class: `grade g-${card.grade}`, 'aria-label': `Overall grade ${card.grade}` }, card.grade), h('small', {}, card.overall == null ? 'not graded' : `${card.overall}/100`))),
    h('div', { class: 'areas' }, Object.values(card.areas).map((a) => h('div', { class: 'area' }, h('span', {}, a.label), h('b', { class: `g-${a.grade}` }, a.grade)))),
    r.summary ? h('p', { class: 'summary' }, r.summary) : null,
    h('p', { class: 'run-line' }, modelSummary(r, calls)),
    h('div', { class: 'stats' },
      h('span', { class: 'stat' }, `${r.stats.proposed} proposed`),
      h('span', { class: 'stat' }, `${r.stats.verified} verified`),
      h('span', { class: 'stat' }, `${r.stats.dropped} dropped`),
      h('span', { class: 'stat' }, `${r.stats.checksRun} checks run`),
      r.stats.notChecked ? h('span', { class: 'stat' }, `${r.stats.notChecked} not checked`) : null,
      h('span', { class: 'stat' }, `${(r.stats.ms / 1000).toFixed(1)} s`)),
    h('div', { id: 'share-slot' })));
  renderShare();

  if (r.partial?.length) {
    root.append(h('div', { class: 'notice', role: 'note' }, h('b', {}, 'Partial run. '), 'Some steps did not finish; nothing unproven was added in their place.', h('ul', {}, r.partial.map((p) => h('li', {}, p)))));
  }

  root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Verified claims'), h('p', {}, 'Each one passed its proof twice: once when gathered, again at the gate.')));
  const order = { issue: 0, risk: 1, good: 2 };
  if (!r.verified.length) root.append(h('p', { class: 'empty' }, 'No claim survived the gate, so Proofline asserts nothing about this business. What was dropped, and why, is below.'));
  for (const c of [...r.verified].sort((a, b) => order[a.tone] - order[b.tone])) root.append(claimCard(c));

  if (r.dropped.length) {
    root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Dropped by the gate'), h('p', {}, 'Proposed, then disproved or not provable. Never shown to the owner.')));
    for (const c of r.dropped) root.append(claimCard(c));
  }

  root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Pitch draft'), h('p', {}, 'For the seller. Every finding cites a verified claim.')));
  root.append(pitchBlock(r));

  root.append(modelPanel(r, calls));
}

function renderShare() {
  const slot = document.getElementById('share-slot');
  if (!slot || !run?.share) return;
  const url = `${location.origin}${run.share.path}`;
  const days = run.share.days || 14;
  const field = h('input', { class: 'share-url', type: 'text', readonly: true, value: url, 'aria-label': 'Link to this report', onfocus: (e) => e.target.select() });
  const status = h('span', { class: 'share-status', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    try { await navigator.clipboard.writeText(url); status.textContent = 'Link copied'; } catch { field.focus(); field.select(); status.textContent = 'Press Ctrl/⌘+C to copy'; }
    setTimeout(() => { status.textContent = ''; }, 2400);
  } }, 'Copy link');
  slot.replaceChildren(h('div', { class: 'share' },
    h('div', { class: 'share-row' }, field, btn),
    h('p', { class: 'share-note' }, `Read-only link, kept ${days} days. It holds the business’s public information and the proofs, nothing about you.`, ' ', status)));
}

function claimCard(c) {
  const dropped = c.verdict === 'dropped';
  const label = dropped ? 'dropped' : { good: 'verified', issue: 'issue', risk: 'check' }[c.tone];
  const out = h('span', { class: 'rerun-result', role: 'status' });
  const list = h('ul', {}, c.evidence.map(evidenceRow));
  return h('div', { class: `claim ${dropped ? 'dropped' : c.tone}`, id: `claim-${c.id}`, tabindex: '-1' },
    h('div', { class: 'claim-top' }, h('h4', {}, c.statement), h('span', { class: `badge ${dropped ? 'dropped' : c.tone}` }, label)),
    !dropped && c.ownerText && c.ownerText !== c.statement ? h('p', { class: 'owner' }, `For the owner: ${c.ownerText}`) : null,
    dropped ? h('p', { class: 'why' }, h('b', {}, 'Why dropped: '), c.dropReason) : null,
    dropped && c.rationale ? h('p', { class: 'why' }, `Model's reason: ${c.rationale}`) : null,
    h('details', { class: 'proof' },
      h('summary', {}, h('span', { class: 'lbl' }, `Proof · ${c.evidence.length} check${c.evidence.length > 1 ? 's' : ''}`), h('span', { class: 'muted' }, `checked ${new Date(c.checkedAt).toLocaleTimeString()}`)),
      list,
      h('button', { class: 'rerun', type: 'button', onclick: (ev) => rerun(c, list, out, ev.currentTarget) }, 'Re-run proof'), out));
}

function evidenceRow(e) {
  const mark = e.skipped ? h('span', { class: 'mark na' }, '–') : e.matched ? h('span', { class: 'mark ok' }, '✓') : h('span', { class: 'mark no' }, '✗');
  return h('li', {}, mark,
    h('div', {}, e.skipped ? `${e.title} — ${e.summary}` : e.pass === null ? `${e.title} — not checked: ${e.summary}` : `${e.title} — expected ${e.expect ? 'pass' : 'fail'}: ${e.summary}`, h('code', {}, `${e.check}(${JSON.stringify(e.params)})`)));
}

async function rerun(c, list, out, btn) {
  btn.disabled = true;
  btn.textContent = 'Running…';
  out.textContent = '';
  try {
    const res = await fetch('/api/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, claimId: c.id }) });
    const r = await res.json().catch(() => ({ error: 'The server sent an unreadable answer. Try again.' }));
    if (r.error) { out.textContent = r.error; return; }
    list.replaceChildren(...r.evidence.map(evidenceRow));
    out.textContent = `${r.verdict === c.verdict ? 'same result' : `changed: now ${r.verdict}`} · ${new Date(r.checkedAt).toLocaleTimeString()}`;
  } catch { out.textContent = 'Could not reach the server. Try again.'; } finally { btn.disabled = false; btn.textContent = 'Re-run proof'; }
}

function pitchBlock(r) {
  const p = r.pitch;
  const cite = (id) => h('button', { type: 'button', class: 'cite', title: 'Show the proof', 'aria-label': `Show the proof for ${id}`, onclick: () => {
    const el = document.getElementById(`claim-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('details').open = true;
    el.focus({ preventScroll: true });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  } }, id);
  if (!p.opening && !p.findings.length && !p.offer) {
    return h('section', { class: 'block pitch' }, h('p', { class: 'muted' }, 'No pitch was written for this run. The verified claims above stand on their own.'));
  }
  const text = [p.subject && `Subject: ${p.subject}`, '', p.opening, '', ...p.findings.map((f) => `- ${f.text}`), '', p.offer, '', p.closing].join('\n');
  const status = h('span', { class: 'share-status', role: 'status' });
  const copyBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(text); status.textContent = 'Draft copied'; } catch { status.textContent = 'Copy failed — select the text instead'; }
    setTimeout(() => { status.textContent = ''; }, 2400);
  } }, 'Copy draft');
  return h('section', { class: 'block pitch' },
    p.subject ? h('div', { class: 'subject' }, `Subject: ${p.subject}`) : null,
    h('p', {}, p.opening),
    p.findings.length ? h('ul', {}, p.findings.map((f) => h('li', {}, f.text, ...f.cites.map(cite)))) : h('p', { class: 'muted' }, 'No issues to pitch. This business is in good shape.'),
    h('p', {}, p.offer), h('p', {}, p.closing),
    h('div', { class: 'actions' }, copyBtn, status),
    r.pitchRemoved?.length ? h('div', { class: 'removed' }, 'Removed before you saw it: ', ...r.pitchRemoved.map((x) => h('span', {}, h('s', {}, x.text), ` (${x.reason}) `))) : null,
    h('p', { class: 'note' }, 'Draft only. Proofline never sends messages.'));
}

// ---- Shared, read-only report (/r/<id>) --------------------------------------------------------

async function openShared(id) {
  document.body.classList.add('shared');
  $('#mode').textContent = 'Shared report · read-only';
  $('#shared-banner').hidden = false;
  resetWorkspace('Loading the shared report…');
  let record = null;
  let problem = 'This report link has expired or does not exist. Shared reports are kept for 14 days.';
  try {
    const res = await fetch(`/api/report/${id}`);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.events) record = body;
    else if (body?.error) problem = body.error;
  } catch { problem = 'Could not load the report. Check your connection and reload the page.'; }
  if (!record) { renderError(problem); $('#shared-when').textContent = 'Link not available'; return; }
  $('#shared-when').textContent = `${record.mode === 'sample' ? 'Recorded example (fictional business)' : 'Live search'} · generated ${when(record.at)}`;
  for (const e of record.events) dispatch(e.type, e);
  run.share = { id: record.id, path: `/r/${record.id}`, at: record.at, days: 14 };
  renderShare();
  const last = record.events.find((e) => e.type === 'done')?.report;
  if (last) $('#clock').textContent = `${(last.stats.ms / 1000).toFixed(1)} s`;
  finish();
}

boot();
