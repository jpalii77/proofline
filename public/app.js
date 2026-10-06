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

let source = null;
let runId = null;
let timer = null;

async function boot() {
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => null);
  const mode = $('#mode');
  if (!cfg) { mode.textContent = 'offline'; return; }
  if (cfg.sampleMode) mode.textContent = 'Sample mode · recorded data, no keys';
  else { mode.textContent = `Live · ${cfg.models.reasoning} on Nebius Token Factory${cfg.tavily ? ' · Tavily' : ''}`; mode.classList.add('live'); }
  const box = $('#samples');
  for (const s of cfg.samples) {
    box.append(h('button', { type: 'button', class: 'chip', onclick: () => { $('#q').value = s.input; start(s.input); } },
      h('b', {}, s.input), h('small', {}, s.blurb)));
  }
  if (!cfg.sampleMode) box.prepend(h('p', { class: 'samples-note' }, 'Recorded examples (fictional businesses):'));
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('#q').value = q; start(q); }
}

$('#form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q) start(q); });

function setStage(stage) {
  const i = ORDER.indexOf(stage);
  document.querySelectorAll('#stages li').forEach((li) => {
    const j = ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('done', j < i);
    li.classList.toggle('active', j === i);
  });
}

function event(tag, body, cls = '') {
  const li = h('li', { class: `ev ${cls}` }, h('span', { class: 'tag' }, tag), h('div', { class: 'body' }, body));
  const list = $('#events');
  list.append(li);
  list.scrollTop = list.scrollHeight;
}

const markOf = (pass) => (pass === true ? h('span', { class: 'mark ok' }, '✓') : pass === false ? h('span', { class: 'mark no' }, '✗') : h('span', { class: 'mark na' }, '?'));

function start(query) {
  if (source) source.close();
  clearInterval(timer);
  $('#workspace').hidden = false;
  document.body.classList.add('ran');
  $('#events').replaceChildren();
  $('#report').replaceChildren(h('div', { class: 'placeholder' }, h('div', { class: 'spinner' }), h('p', {}, 'Working. The report appears once every claim has been through the gate.')));
  setStage('plan');
  $('#go').disabled = true;
  const t0 = performance.now();
  timer = setInterval(() => { $('#clock').textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`; }, 100);
  history.replaceState(null, '', `?q=${encodeURIComponent(query)}`);
  if (window.matchMedia('(max-width: 880px)').matches) $('#workspace').scrollIntoView({ behavior: 'smooth' });

  source = new EventSource(`/api/run?q=${encodeURIComponent(query)}`);
  const on = (type, fn) => source.addEventListener(type, (m) => { const e = JSON.parse(m.data); if (STAGE_OF[type]) setStage(STAGE_OF[type]); fn(e); });

  on('run', (e) => { runId = e.runId; });
  on('start', (e) => event('start', [h('b', {}, e.query), h('span', { class: 'meta' }, `reasoning: ${e.models.reasoning} · fast: ${e.models.fast}`)]));
  on('intake', (e) => event('intake', `Parsed as ${e.parsed.domain ? `domain ${e.parsed.domain}` : `“${e.parsed.name}”${e.parsed.city ? ` in ${e.parsed.city}` : ''}`}`));
  on('discover', (e) => event('tavily', [h('b', {}, `${e.results.length} web result(s)`), h('span', { class: 'meta' }, e.error || e.query)]));
  on('plan', (e) => event('plan', [
    h('b', {}, e.ctx.domain || e.ctx.name),
    ` ${[e.ctx.city, e.ctx.phone].filter(Boolean).join(' · ')}`,
    e.reasoning ? h('span', { class: 'meta' }, e.reasoning) : null,
    ...e.guard.map((g) => h('span', { class: 'meta warn' }, `guard: ${g}`)),
    h('span', { class: 'meta' }, `${e.model} · ${e.ms} ms`),
  ]));
  on('tool', (e) => { if (e.phase === 'gather') event(TOOL_LABEL[e.tool] || e.tool, h('span', { class: 'meta flat' }, `${shortArgs(e.args)} · ${e.ms} ms${e.error ? ` · ${e.error}` : ''}`)); });
  on('observe', (e) => event('check', [markOf(e.pass), h('b', {}, e.title), h('span', { class: 'meta' }, e.summary)], e.pass === true ? 'pass' : e.pass === false ? 'fail' : ''));
  on('propose', (e) => event('claims', [h('b', {}, `${e.claims.length} claim(s) proposed`), h('span', { class: 'meta' }, `${e.model} · ${e.ms} ms${e.rejected.length ? ` · ${e.rejected.length} outside catalog` : ''}`)]));
  on('gate', (e) => event(e.verdict === 'verified' ? 'kept' : 'dropped', [h('b', {}, e.statement), e.dropReason ? h('span', { class: 'meta' }, e.dropReason) : h('span', { class: 'meta' }, `${e.evidence.length} check(s) re-run, all matched`)], e.verdict === 'verified' ? 'pass' : 'fail drop'));
  on('verify', (e) => event('verify', [h('b', {}, `${e.rewritten} owner line(s)`), h('span', { class: 'meta' }, `${e.model}${e.rejected.length ? ` · ${e.rejected.length} rewrite(s) rejected` : ''}`)]));
  on('write', (e) => event('write', [h('b', {}, `Pitch: ${e.kept} cited finding(s)`), e.removed.length ? h('span', { class: 'meta' }, `${e.removed.length} uncited sentence(s) removed`) : null]));
  on('done', (e) => { finish(); document.querySelectorAll('#stages li').forEach((li) => { li.classList.add('done'); li.classList.remove('active'); }); renderReport(e.report); });
  source.addEventListener('error', (m) => {
    if (m.data) { const e = JSON.parse(m.data); renderError(e.message); }
    else if (source.readyState === EventSource.CLOSED || !runId) { /* stream ended */ }
    finish();
  });
}

function finish() { if (source) source.close(); clearInterval(timer); $('#go').disabled = false; }

function shortArgs(args) {
  const a = args[0];
  if (typeof a === 'string') return a.replace(/^https?:\/\//, '').slice(0, 60);
  return JSON.stringify(a).slice(0, 60);
}

function renderError(msg) {
  $('#report').replaceChildren(h('div', { class: 'error-box' }, msg));
}

function renderReport(r) {
  const card = r.card;
  const root = $('#report');
  root.replaceChildren();

  root.append(h('section', { class: 'block' },
    h('div', { class: 'biz' },
      h('div', {},
        h('h2', {}, 'Digital health card'),
        h('h3', {}, r.ctx.name || r.ctx.domain),
        h('div', { class: 'facts' }, [r.ctx.domain, r.ctx.city, r.ctx.phone].filter(Boolean).map((f) => h('span', {}, f)))),
      h('div', { class: 'overall' }, h('div', { class: `grade g-${card.grade}` }, card.grade), h('small', {}, card.overall == null ? 'not graded' : `${card.overall}/100`))),
    h('div', { class: 'areas' }, Object.values(card.areas).map((a) => h('div', { class: 'area' }, h('span', {}, a.label), h('b', { class: `g-${a.grade}` }, a.grade)))),
    r.summary ? h('p', { class: 'summary' }, r.summary) : null,
    h('div', { class: 'stats' },
      h('span', { class: 'stat' }, `${r.stats.proposed} proposed`),
      h('span', { class: 'stat' }, `${r.stats.verified} verified`),
      h('span', { class: 'stat' }, `${r.stats.dropped} dropped`),
      h('span', { class: 'stat' }, `${r.stats.checksRun} checks run`),
      h('span', { class: 'stat' }, `${(r.stats.ms / 1000).toFixed(1)} s`))));

  root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Verified claims'), h('p', {}, 'Each one passed its proof twice: once when gathered, again at the gate.')));
  const order = { issue: 0, risk: 1, good: 2 };
  for (const c of [...r.verified].sort((a, b) => order[a.tone] - order[b.tone])) root.append(claimCard(c));

  if (r.dropped.length) {
    root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Dropped by the gate'), h('p', {}, 'Proposed by the model, disproved by the checks. Never shown to the owner.')));
    for (const c of r.dropped) root.append(claimCard(c));
  }

  root.append(h('div', { class: 'section-head' }, h('h2', {}, 'Pitch draft'), h('p', {}, 'For the seller. Every finding cites a verified claim.')));
  root.append(pitchBlock(r));
}

function claimCard(c) {
  const dropped = c.verdict === 'dropped';
  const label = dropped ? 'dropped' : { good: 'verified', issue: 'issue', risk: 'check' }[c.tone];
  const out = h('span', { class: 'rerun-result' });
  const list = h('ul', {}, c.evidence.map(evidenceRow));
  const el = h('div', { class: `claim ${dropped ? 'dropped' : c.tone}`, id: `claim-${c.id}` },
    h('div', { class: 'claim-top' }, h('h4', {}, c.statement), h('span', { class: `badge ${dropped ? 'dropped' : c.tone}` }, label)),
    !dropped && c.ownerText && c.ownerText !== c.statement ? h('p', { class: 'owner' }, `For the owner: ${c.ownerText}`) : null,
    dropped ? h('p', { class: 'why' }, h('b', {}, 'Why dropped: '), c.dropReason) : null,
    dropped && c.rationale ? h('p', { class: 'why' }, `Model's reason: ${c.rationale}`) : null,
    h('details', { class: 'proof' },
      h('summary', {}, h('span', { class: 'lbl' }, `Proof · ${c.evidence.length} check${c.evidence.length > 1 ? 's' : ''}`), h('span', { class: 'muted' }, `checked ${new Date(c.checkedAt).toLocaleTimeString()}`)),
      list,
      h('button', { class: 'rerun', type: 'button', onclick: (ev) => rerun(c, list, out, ev.currentTarget) }, 'Re-run proof'), out));
  return el;
}

function evidenceRow(e) {
  return h('li', {}, e.matched ? h('span', { class: 'mark ok' }, '✓') : h('span', { class: 'mark no' }, '✗'),
    h('div', {}, `${e.title} — expected ${e.expect ? 'pass' : 'fail'}: ${e.summary}`, h('code', {}, `${e.check}(${JSON.stringify(e.params)})`)));
}

async function rerun(c, list, out, btn) {
  btn.disabled = true;
  out.textContent = 'running…';
  try {
    const r = await fetch('/api/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, claimId: c.id }) }).then((x) => x.json());
    if (r.error) { out.textContent = r.error; return; }
    list.replaceChildren(...r.evidence.map(evidenceRow));
    out.textContent = `${r.verdict === c.verdict ? 'same result' : `changed: now ${r.verdict}`} · ${new Date(r.checkedAt).toLocaleTimeString()}`;
  } catch { out.textContent = 'failed'; } finally { btn.disabled = false; }
}

function pitchBlock(r) {
  const p = r.pitch;
  const cite = (id) => h('button', { type: 'button', class: 'cite', title: 'Show the proof', onclick: () => {
    const el = document.getElementById(`claim-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('details').open = true;
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  } }, id);
  const text = [p.subject && `Subject: ${p.subject}`, '', p.opening, '', ...p.findings.map((f) => `- ${f.text}`), '', p.offer, '', p.closing].join('\n');
  const copyBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy failed'; }
    setTimeout(() => { copyBtn.textContent = 'Copy draft'; }, 1500);
  } }, 'Copy draft');
  return h('section', { class: 'block pitch' },
    p.subject ? h('div', { class: 'subject' }, `Subject: ${p.subject}`) : null,
    h('p', {}, p.opening),
    p.findings.length ? h('ul', {}, p.findings.map((f) => h('li', {}, f.text, ...f.cites.map(cite)))) : h('p', { class: 'muted' }, 'No issues to pitch. This business is in good shape.'),
    h('p', {}, p.offer), h('p', {}, p.closing),
    h('div', { class: 'actions' }, copyBtn),
    r.pitchRemoved?.length ? h('div', { class: 'removed' }, 'Removed before you saw it: ', ...r.pitchRemoved.map((x) => h('span', {}, h('s', {}, x.text), ` (${x.reason}) `))) : null,
    h('p', { class: 'note' }, 'Draft only. Proofline never sends messages.'));
}

boot();
