// Proofline UI. Plain DOM, no framework. All text from the server is set with textContent.

import { applyStatic, DICT, dateTime, getLang, num, onLangChange, partialText, secs, serverText, setLang, t, time } from './i18n.js';
import { setupTour } from './tour.js';
import { createGateStage } from './gate.js';
import { gateSummary, laneFromGate, lanesFromEvents, lanesFromReport, miniLabel, shortLabel } from './gate-data.js';

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
const working = (stage) => (ORDER.includes(stage) ? t(`working.${stage}`) : null);
const outcomeText = (o) => (['accepted', 'partial', 'rejected', 'failed'].includes(o) ? t(`outcome.${o}`) : o);
const tierText = (x) => (x === 'reasoning' || x === 'fast' ? t(`tier.${x}`) : x);
const roleText = (x) => (`role.${x}` in DICT.en ? t(`role.${x}`) : x);
const SHARE_PATH = /^\/r(?:\/([^/]*))?\/?$/; // any /r/<x>: a broken link shows the “expired or does not exist” note
const SHARE_ID = /^[a-z0-9]{12}$/;

let source = null;
let runId = null;
let timer = null;
let run = null; // { events, share, report, ended }

let demo = null;
let stage = null; // the run's gate visual
let hero = null; // the landing page's gate visual
let replaying = false; // shared links replay a finished trace: no animation, straight to the result
let cfg = null; // /api/config, kept so the language switch can redraw what came from it
let sharedRecord = null; // the shared report shown on /r/<id> (null elsewhere, or when it failed to load)
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Landing visual: real claims from the recorded examples (fixtures/sample), with the gate's real verdicts.
const ok = (check) => ({ check, matched: true });
const bad = (check) => ({ check, matched: false });
const HERO_CLAIMS = () => [
  { id: 'h1', claimType: 'site_online', label: t('hero.h1.label'), verdict: 'verified', evidence: [ok('site.own_site'), ok('http.reachable'), ok('page.not_parked')], statement: t('hero.h1.statement') },
  { id: 'h2', claimType: 'site_unreachable', label: t('hero.h2.label'), verdict: 'dropped', dropReason: t('hero.h2.reason'), evidence: [ok('site.own_site'), bad('http.reachable')], statement: t('hero.h2.statement') },
  { id: 'h3', claimType: 'ssl_expiring_soon', label: t('hero.h3.label'), verdict: 'verified', evidence: [ok('site.own_site'), ok('tls.cert_valid')], statement: t('hero.h3.statement') },
  { id: 'h4', claimType: 'possibly_renamed', label: t('hero.h4.label'), verdict: 'dropped', dropReason: t('hero.h4.reason'), evidence: [bad('site.own_site'), ok('http.reachable'), ok('page.name_match')], statement: t('hero.h4.statement') },
  { id: 'h5', claimType: 'on_map', label: t('hero.h5.label'), verdict: 'verified', evidence: [ok('osm.listed')], statement: t('hero.h5.statement') },
  { id: 'h6', claimType: 'phone_confirmed', label: t('hero.h6.label'), verdict: 'dropped', dropReason: t('hero.h6.reason'), evidence: [ok('site.own_site'), bad('page.phone_listed')], statement: t('hero.h6.statement') },
  { id: 'h7', claimType: 'no_contact_path', label: t('hero.h7.label'), verdict: 'verified', evidence: [ok('site.own_site'), ok('page.contact_path')], statement: t('hero.h7.statement') },
];

function startHero() {
  const box = $('#hero-stage');
  if (!box || hero) return;
  hero = createGateStage({ loop: true, spacing: 1050, ariaLabel: t('stage.aria') });
  box.append(hero.el);
  for (const c of HERO_CLAIMS()) hero.add({ ...laneFromGate(c), label: c.label });
  hero.close();
  const btn = $('#hero-pause');
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = t('stage.pause');
  if (reducedMotion()) btn.hidden = true;
}

$('#hero-pause').addEventListener('click', (ev) => {
  if (!hero) return;
  const p = !hero.paused;
  hero.setPaused(p);
  ev.currentTarget.setAttribute('aria-pressed', String(p));
  ev.currentTarget.textContent = p ? t('stage.play') : t('stage.pause');
});

function stopHero() {
  if (!hero) return;
  hero.destroy();
  hero = null;
  $('#hero-visual').hidden = true;
}
const liveMode = () => !!demo && document.querySelector('input[name="mode"]:checked')?.value === 'live';
const fmt = (n) => num(n);
const when = (at) => dateTime(at);
const clock = (ms) => `${num(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t('stat.seconds')}`; // the run clock: always one decimal

function setLeft(n) {
  if (!demo?.live) return;
  demo.left = n;
  $('#left').textContent = n > 0 ? t('modes.left', { n }) : t('modes.quotaUsed');
}

const recordedOnly = () => !!cfg && (demo ? !liveMode() : cfg.sampleMode);

function setModeNote() {
  const note = $('#mode-note');
  if (!demo) {
    // local sample mode: only the four examples work, so say so where the visitor is about to type
    if (cfg?.sampleMode) { note.hidden = false; note.textContent = t('note.sample'); $('#q').placeholder = t('ask.placeholderSample'); }
    return;
  }
  note.hidden = false;
  if (!liveMode()) note.textContent = t('note.sample');
  else if (!demo.live) note.textContent = t('note.notConfigured');
  else note.textContent = t('note.live', { perVisitor: num(demo.limits.perVisitor), perDay: num(demo.limits.perDay), hours: num(demo.limits.cacheHours) });
  $('#q').placeholder = liveMode() ? t('ask.placeholder') : t('ask.placeholderSample');
}

// Everything that comes from /api/config, drawn in the current language (again on a language switch).
function renderConfig() {
  const mode = $('#mode');
  if (document.body.classList.contains('shared')) { mode.textContent = t('shared.pill'); return; }
  if (cfg === false) {
    mode.textContent = t('mode.offline');
    $('#samples').replaceChildren(h('p', { class: 'samples-note', role: 'alert' }, t('offline.note')));
    return;
  }
  if (!cfg) return;
  if (demo) {
    mode.textContent = demo.live ? t('mode.demoLive') : t('mode.demo');
    if (!demo.live) $('#left').textContent = t('modes.notConfigured');
    else setLeft(demo.left);
  } else if (cfg.sampleMode) mode.textContent = t('mode.sample');
  else mode.textContent = t(cfg.tavily ? 'mode.liveTavily' : 'mode.live', { model: cfg.models.reasoning });
  const box = $('#samples');
  box.replaceChildren();
  for (const s of cfg.samples) {
    const blurb = `blurb.${s.id}` in DICT.en && DICT.en[`blurb.${s.id}`] === s.blurb ? t(`blurb.${s.id}`) : s.blurb;
    box.append(h('button', { type: 'button', class: 'chip', onclick: () => {
      if (demo) { document.querySelector('input[name="mode"][value="sample"]').checked = true; setModeNote(); }
      $('#q').value = s.input; start(s.input);
    } }, h('b', {}, s.input), h('small', {}, blurb)));
  }
  if (!cfg.sampleMode || demo) box.prepend(h('p', { class: 'samples-note' }, t('samples.note')));
  setModeNote();
}

async function boot() {
  syncLangButtons();
  if (getLang() !== 'en') relocalizeStatic();
  const shared = SHARE_PATH.exec(location.pathname);
  if (shared) return openShared(shared[1] || '');
  startHero();
  cfg = await fetch('/api/config').then((r) => (r.ok ? r.json() : null)).catch(() => null) || false;
  const mode = $('#mode');
  mode.hidden = false;
  if (!cfg) { renderConfig(); return; }
  demo = cfg.demo || null;
  if (demo) {
    $('#modes').hidden = false;
    document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', setModeNote));
  } else if (!cfg.sampleMode) mode.classList.add('live');
  renderConfig();
  const params = new URLSearchParams(location.search);
  if (demo && params.get('live') === '1') { document.querySelector('input[name="mode"][value="live"]').checked = true; setModeNote(); }
  const q = params.get('q');
  if (q) { $('#q').value = q; start(q); }
}

// ---- Language switch -------------------------------------------------------------------------

function syncLangButtons() {
  document.querySelectorAll('.lang [data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}

// The page's fixed text, the tab title and the controls whose text depends on state.
function relocalizeStatic() {
  applyStatic();
  syncLangButtons();
  if (!document.body.classList.contains('shared')) document.title = t('doc.title');
  if (!$('#ask-hint').hidden) askHint(true);
  const running = document.body.classList.contains('running');
  $('#go').textContent = running ? t('ask.busy') : t('ask.go');
  if (sharedRecord) $('#shared-when').textContent = sharedWhen(sharedRecord);
  else if (document.body.classList.contains('shared') && run?.ended) $('#shared-when').textContent = t('shared.unavailable');
}

function relocalize() {
  relocalizeStatic();
  if (hero) { hero.destroy(); hero = null; startHero(); }
  renderConfig();
  if (run?.ended) replayRun();
}

document.querySelectorAll('.lang [data-lang]').forEach((b) => b.addEventListener('click', () => {
  const next = b.dataset.lang;
  // an explicit ?lang= in the address would win on reload: keep it in step with the choice
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.set('lang', next); history.replaceState(null, '', url); }
  setLang(next, { persist: true });
  syncLangButtons();
}));
onLangChange(relocalize);

// An empty box gets a plain hint instead of nothing (or the browser's own bubble, in its own language).
function askHint(show) {
  const hint = $('#ask-hint');
  hint.hidden = !show;
  hint.textContent = show ? t(recordedOnly() ? 'ask.emptyHintSample' : 'ask.emptyHint') : '';
  $('#q').setAttribute('aria-invalid', String(!!show));
}
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (q) { askHint(false); start(q); } else { askHint(true); $('#q').focus(); }
});
$('#q').addEventListener('input', () => { if (!$('#ask-hint').hidden) askHint(false); });

function setStage(stage) {
  const i = ORDER.indexOf(stage);
  document.querySelectorAll('#stages li').forEach((li) => {
    const j = ORDER.indexOf(li.dataset.stage);
    li.classList.toggle('done', j < i);
    li.classList.toggle('active', j === i);
  });
  const ph = $('#report .placeholder p');
  if (ph && working(stage)) ph.textContent = working(stage);
  if (run?.gateStatus && !run.gateStarted && working(stage)) run.gateStatus.textContent = working(stage);
}

function event(tag, body, cls = '') {
  const li = h('li', { class: `ev ${cls}` }, h('span', { class: 'tag' }, tag), h('div', { class: 'body' }, body));
  const list = $('#events');
  list.append(li);
  list.scrollTop = list.scrollHeight;
}

const markOf = (pass) => (pass === true ? h('span', { class: 'mark ok', 'aria-label': t('mark.pass') }, '✓') : pass === false ? h('span', { class: 'mark no', 'aria-label': t('mark.fail') }, '✗') : h('span', { class: 'mark na', 'aria-label': t('mark.na') }, '?'));

function tokensText(u) {
  if (!u) return t('ev.tokensNone');
  return u.reasoning ? t('ev.tokensReasoning', { in: fmt(u.in), out: fmt(u.out), reasoning: fmt(u.reasoning) }) : t('ev.tokens', { in: fmt(u.in), out: fmt(u.out) });
}

function gateTrace(e) {
  event(e.verdict === 'verified' ? t('tag.kept') : t('tag.dropped'), [h('b', {}, e.statement), e.dropReason ? h('span', { class: 'meta' }, e.dropReason) : h('span', { class: 'meta' }, t('ev.allMatched', { n: e.evidence.length }))], e.verdict === 'verified' ? 'pass' : 'fail drop');
}

const parsedText = (p) => (p.domain ? t('ev.parsedDomain', { domain: p.domain }) : p.city ? t('ev.parsedNameCity', { name: p.name, city: p.city }) : t('ev.parsedName', { name: p.name }));

// One handler per trace event. Used by the live stream and by the shared-report replay.
const HANDLERS = {
  run: (e) => { runId = e.runId; if (typeof e.left === 'number') setLeft(e.left); },
  cached: (e) => event(t('tag.cache'), [h('b', {}, t('ev.cacheTitle')), h('span', { class: 'meta' }, e.ageMinutes < 60 ? t('ev.cacheMin', { n: num(e.ageMinutes) }) : t('ev.cacheHours', { n: num(Math.round(e.ageMinutes / 60)) }))]),
  start: (e) => event(t('tag.start'), [h('b', {}, e.query), h('span', { class: 'meta' }, t('ev.models', { reasoning: e.models.reasoning, fast: e.models.fast }))]),
  intake: (e) => event(t('tag.intake'), parsedText(e.parsed)),
  discover: (e) => event(t('tag.tavily'), [h('b', {}, t('ev.results', { n: e.results.length })), h('span', { class: e.error ? 'meta warn' : 'meta' }, e.error ? t('ev.searchFailed', { error: e.error }) : e.query)]),
  plan: (e) => event(t('tag.plan'), [
    h('b', {}, e.ctx.domain || e.ctx.name),
    ` ${[e.ctx.city, e.ctx.phone].filter(Boolean).join(' · ')}`,
    e.reasoning ? h('span', { class: 'meta' }, e.reasoning) : null,
    ...e.guard.map((g) => h('span', { class: 'meta warn' }, t('ev.guard', { text: g }))),
  ]),
  model: (e) => event(t('tag.model'), [
    h('b', {}, `${roleText(e.role)} · ${e.model}`),
    h('span', { class: 'meta' }, `${tierText(e.tier)} · ${secs(e.ms || 0)} · ${tokensText(e.usage)}`),
    h('span', { class: `meta outcome o-${e.outcome}` }, `${outcomeText(e.outcome)}${e.detail ? ` — ${e.detail}` : ''}`),
  ], `model o-${e.outcome}`),
  tool: (e) => { if (e.phase === 'gather') event(TOOL_LABEL[e.tool] || e.tool, h('span', { class: 'meta flat' }, `${shortArgs(e.args)} · ${num(e.ms)} ms${e.error ? ` · ${e.error}` : ''}`)); },
  observe: (e) => event(t('tag.check'), [markOf(e.pass), h('b', {}, e.title), h('span', { class: 'meta' }, e.summary)], e.pass === true ? 'pass' : e.pass === false ? 'fail' : 'na'),
  propose: (e) => {
    event(t('tag.claims'), [h('b', {}, t('ev.toClaims', { n: e.claims.length })), e.rejected.length ? h('span', { class: 'meta' }, t('ev.refused', { n: num(e.rejected.length) })) : null]);
    openGate(e.claims);
  },
  gate: (e) => gateEvent(e),
  verify: (e) => event(t('tag.verify'), [h('b', {}, e.skipped ? t('ev.noRewrite') : t('ev.ownerLines', { n: e.rewritten })), e.rejected.length ? h('span', { class: 'meta warn' }, t('ev.rewritesRejected', { n: e.rejected.length, reasons: e.rejected.map((r) => r.reason).join('; ') })) : null]),
  write: (e) => event(t('tag.write'), [h('b', {}, e.failed ? t('ev.pitchNone') : t('ev.pitch', { n: e.kept })), e.removed.length ? h('span', { class: 'meta' }, t('ev.uncited', { n: e.removed.length })) : null]),
  done: (e) => {
    run.report = e.report;
    document.querySelectorAll('#stages li').forEach((li) => { li.classList.add('done'); li.classList.remove('active'); });
    if (stage && !replaying) {
      // let the last cards land, then the report takes over (the gate stays in it, settled)
      const mine = run;
      stage.close();
      stage.whenSettled(() => { if (run === mine) renderReport(e.report); });
    } else renderReport(e.report);
  },
  share: (e) => { run.share = e; renderShare(); },
};

// ---- The gate, live ----------------------------------------------------------------------------

function gateBlock(body, extra) {
  return h('section', { class: 'block gate-block', 'aria-labelledby': 'gate-h' },
    h('div', { class: 'gate-head' },
      h('div', {}, h('h2', { id: 'gate-h' }, t('gate.title')), h('p', { class: 'gate-sub' }, t('gate.sub'))),
      extra),
    body);
}

// The gate block is on screen from the start of a run (same size throughout, so nothing jumps);
// claims join its queue when the model proposes them.
function gateShell(text) {
  stage?.destroy();
  stage = createGateStage({ onPick: pickClaim });
  const status = h('p', { class: 'gate-status', role: 'status' }, text);
  const skip = h('button', { type: 'button', class: 'btn ghost small', onclick: () => stage?.settleNow() }, t('gate.skip'));
  run.gateStatus = status;
  run.gateStarted = false;
  $('#report').replaceChildren(gateBlock(h('div', { class: 'gate-body' }, stage.el, status), skip));
}

function openGate(claims) {
  if (!run || replaying) return;
  if (!stage) gateShell('');
  run.gateStarted = true;
  run.gateStatus.textContent = claims.length ? t('gate.atGate', { n: claims.length }) : t('gate.none');
  stage.seed(claims.map((c) => ({ id: c.id, label: shortLabel(c.type) || c.statement, mini: miniLabel(c.type), statement: c.statement })));
}

function gateEvent(e) {
  gateTrace(e);
  if (!stage || replaying) return;
  stage.add(laneFromGate(e));
  if (run.gateStatus) run.gateStatus.textContent = t('gate.running');
}

function pickClaim(lane) {
  const el = document.getElementById(`claim-${lane.id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  el.querySelector('details').open = true;
  el.focus({ preventScroll: true });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
}

function dispatch(type, e) {
  if (!run) return;
  run.events.push(e);
  if (STAGE_OF[type]) setStage(STAGE_OF[type]);
  HANDLERS[type]?.(e);
}

function resetWorkspace(placeholder = t('working.default')) {
  if (source) source.close();
  clearInterval(timer);
  stage?.destroy();
  stage = null;
  stopHero();
  run = { events: [], share: null, report: null, ended: false };
  runId = null;
  $('#workspace').hidden = false;
  $('.trace').hidden = false;
  document.body.classList.add('ran');
  $('#events').replaceChildren();
  $('#clock').textContent = clock(0);
  if (document.body.classList.contains('shared')) $('#report').replaceChildren(h('div', { class: 'placeholder', role: 'status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', {}, placeholder)));
  else gateShell(placeholder);
  $('#report').setAttribute('aria-busy', 'true');
}

function start(query) {
  resetWorkspace();
  document.body.classList.add('running');
  setStage('plan');
  $('#go').disabled = true;
  $('#go').textContent = t('ask.busy');
  const t0 = performance.now();
  timer = setInterval(() => { $('#clock').textContent = clock(performance.now() - t0); }, 100);
  const live = liveMode();
  const keepLang = new URLSearchParams(location.search).get('lang');
  history.replaceState(null, '', `/?q=${encodeURIComponent(query)}${live ? '&live=1' : ''}${keepLang ? `&lang=${encodeURIComponent(keepLang)}` : ''}`);
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
      renderError('key:error.stopped', query);
    }
    finish();
  });
}

function finish() {
  if (source) source.close();
  clearInterval(timer);
  $('#go').disabled = false;
  $('#go').textContent = t('ask.go');
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

// msg: a server message as sent (English; known ones are shown translated) or 'key:<i18n key>'.
function renderError(msg, query) {
  document.body.classList.remove('running');
  if (run) run.error = { msg, query };
  const key = String(msg).startsWith('key:') ? String(msg).slice(4) : null;
  const english = key ? DICT.en[key] : String(msg);
  const shown = key ? t(key) : serverText(msg);
  const actions = [];
  if (query && !FINAL_ERROR.test(english)) actions.push(h('button', { type: 'button', class: 'btn', onclick: () => start(query) }, t('error.retry')));
  if (document.querySelector('#samples .chip')) actions.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => { $('#samples').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#samples .chip')?.focus({ preventScroll: true }); } }, t('error.pickExample')));
  const box = h('div', { class: 'error-box', role: 'alert' }, h('p', {}, shown), actions.length ? h('div', { class: 'actions' }, actions) : null);
  stage?.destroy();
  stage = null;
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
    if (e.type === 'plan' && e.guard?.length) { outcome = 'partial'; detail = t('legacy.guard', { text: e.guard.join('; ') }); }
    if (e.type === 'propose' && e.rejected?.length) { outcome = 'partial'; detail = t('legacy.outside', { n: num(e.rejected.length) }); }
    if (e.type === 'verify' && e.rejected?.length) { outcome = e.rewritten ? 'partial' : 'rejected'; detail = e.rejected.map((r) => r.reason).join('; '); }
    if (e.type === 'write' && e.removed?.length) { outcome = e.kept ? 'partial' : 'rejected'; detail = t('legacy.removed', { n: num(e.removed.length) }); }
    out.push({ stage: e.type, role: role[e.type][0], tier: role[e.type][1], model: e.model, ms: e.ms || 0, usage: null, outcome, detail });
  }
  return out;
}

function modelSummary(r, calls) {
  const known = calls.filter((c) => c.usage);
  const tokens = known.length ? known.reduce((n, c) => n + (c.usage.total ?? ((c.usage.in || 0) + (c.usage.out || 0))), 0) : null;
  const n = calls.filter((c) => !c.skipped).length;
  const standIn = calls.length > 0 && calls.every((c) => /sample/.test(c.model));
  const parts = [t('models.calls', { n }), standIn ? t('models.standIn') : tokens == null ? t('ev.tokensNone') : t('models.tokens', { n: fmt(tokens) }), t('models.droppedByGate', { n: r.stats.dropped })];
  if (r.stats.rewritesRejected) parts.push(t('models.rewritesRejected', { n: r.stats.rewritesRejected }));
  return parts.join(' · ');
}

function modelPanel(r, calls) {
  const sample = calls.length > 0 && calls.every((c) => /sample/.test(c.model));
  return h('section', { class: 'block models', id: 'models', 'aria-labelledby': 'models-h' },
    h('div', { class: 'models-head' },
      h('h2', { id: 'models-h' }, t('models.title')),
      h('p', {}, sample
        ? t('models.sample')
        : `${t('models.live')}${calls.length && !calls.some((c) => c.usage) ? ` ${t('models.noTokens')}` : ''}`)),
    calls.length ? h('ol', { class: 'calls' }, calls.map((c) => h('li', { class: `call o-${c.outcome}` },
      h('div', { class: 'call-main' },
        h('b', {}, roleText(c.role)),
        h('span', { class: 'tier' }, tierText(c.tier)),
        h('code', {}, c.model)),
      h('div', { class: 'call-nums' },
        h('span', {}, secs(c.ms || 0)),
        h('span', {}, c.usage ? t('models.in', { n: fmt(c.usage.in) }) : t('models.tokensDash')),
        c.usage ? h('span', {}, t('models.out', { n: fmt(c.usage.out) })) : null),
      h('div', { class: 'call-out' },
        h('span', { class: `verdict o-${c.outcome}` }, outcomeText(c.outcome)),
        c.detail ? h('span', { class: 'detail' }, c.detail) : null)))) : h('p', { class: 'muted' }, t('models.none')));
}

// ---- Report ---------------------------------------------------------------------------------

const gradeWord = (g) => (['A', 'B', 'C', 'D', 'F'].includes(g) ? t(`grade.${g}`) : g === '–' ? t('grade.none') : '');

function gradeRing(grade, score) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 88 88');
  svg.setAttribute('aria-hidden', 'true');
  const ring = (cls, dash) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '44'); c.setAttribute('cy', '44'); c.setAttribute('r', '39');
    c.setAttribute('class', cls);
    if (dash != null) { c.setAttribute('pathLength', '100'); c.setAttribute('stroke-dasharray', `${dash} 100`); }
    return c;
  };
  svg.append(ring('track'), ring('arc', score == null ? 0 : Math.max(2, score)));
  return h('div', { class: `ring g-${grade}`, role: 'img', 'aria-label': score == null ? t('grade.aria', { grade }) : t('grade.ariaScore', { grade, score: num(score) }) }, svg, h('b', { 'aria-hidden': 'true' }, grade));
}

function areaTile([key, a]) {
  const graded = a.score != null;
  return h('div', { class: `area${graded ? '' : ' none'}` },
    h('div', { class: 'area-top' }, h('span', {}, `area.${key}` in DICT.en ? t(`area.${key}`) : a.label), h('b', { class: `g-${a.grade}` }, graded ? a.grade : '–')),
    h('div', { class: 'bar', 'aria-hidden': 'true' }, graded ? h('i', { class: `g-${a.grade}`, style: null, 'data-w': a.score }) : null),
    h('small', {}, graded ? t('area.score', { n: num(a.score) }) : t('area.none')));
}

function renderReport(r) {
  document.body.classList.remove('running');
  const card = r.card;
  const root = $('#report');
  const calls = r.models?.calls || legacyCalls(run?.events || []);
  const at = r.generatedAt || run?.events.find((e) => e.type === 'cached')?.at || null;
  const fromEvents = lanesFromEvents(run?.events || []);
  const lanes = fromEvents.length ? fromEvents : lanesFromReport(r);
  const live = stage; // the stage that just ran, settled, moves into the report as it is
  stage = null;
  root.replaceChildren();
  root.removeAttribute('aria-busy');

  const areas = Object.entries(card.areas).map(areaTile);
  root.append(h('section', { class: 'block card' },
    h('div', { class: 'biz' },
      h('div', { class: 'biz-id' },
        h('h2', {}, t('card.title')),
        h('h3', {}, r.ctx.displayName || r.ctx.name || r.ctx.domain),
        h('div', { class: 'facts' }, [r.ctx.domain, r.ctx.city, r.ctx.phone].filter(Boolean).map((f) => h('span', {}, f))),
        at ? h('p', { class: 'generated' }, t('card.generated', { when: when(at) })) : null),
      h('div', { class: 'overall' }, gradeRing(card.grade, card.overall), h('small', {}, gradeWord(card.grade)))),
    h('div', { class: 'areas' }, areas),
    r.summary ? h('p', { class: 'summary' }, r.summary) : null,
    h('a', { class: 'run-line', href: '#models' }, h('span', {}, modelSummary(r, calls)), h('span', { class: 'run-go', 'aria-hidden': 'true' }, '↓')),
    h('div', { class: 'stats' },
      h('span', { class: 'stat' }, h('b', {}, num(r.stats.proposed)), ` ${t('stat.proposed')}`),
      h('span', { class: 'stat good' }, h('b', {}, num(r.stats.verified)), ` ${t('stat.verified')}`),
      h('span', { class: 'stat drop' }, h('b', {}, num(r.stats.dropped)), ` ${t('stat.dropped')}`),
      h('span', { class: 'stat' }, h('b', {}, num(r.stats.checksRun)), ` ${t('stat.checksRun')}`),
      r.stats.notChecked ? h('span', { class: 'stat' }, h('b', {}, num(r.stats.notChecked)), ` ${t('stat.notChecked')}`) : null,
      h('span', { class: 'stat' }, h('b', {}, num(r.stats.ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })), ` ${t('stat.seconds')}`)),
    h('div', { id: 'share-slot' })));
  root.querySelectorAll('.bar i').forEach((i) => { i.style.width = `${i.dataset.w}%`; });
  renderShare();

  if (r.partial?.length) {
    root.append(h('div', { class: 'notice', role: 'note' }, h('b', {}, t('partial.title')), t('partial.body'), h('ul', {}, r.partial.map((p) => h('li', {}, partialText(p))))));
  }

  // The gate, settled: what was proposed, what passed, what was dropped and why.
  const sum = gateSummary(lanes);
  const tally = h('p', { class: 'gate-tally' }, h('b', {}, num(sum.proposed)), ` ${t('gate.tallyProposed')} → `, h('b', { class: 'good' }, num(sum.kept)), ` ${t('gate.tallyVerified')} · `, h('b', { class: 'drop' }, num(sum.dropped)), ` ${t('gate.tallyDropped')}`);
  if (lanes.length) {
    const st = live || createGateStage({ onPick: pickClaim, instant: true });
    root.append(gateBlock(h('div', { class: 'gate-body settled' }, st.el, h('p', { class: 'gate-hint' }, t('gate.hint'))), tally));
    if (!live) { for (const l of lanes) st.add(l); st.close(); }
    st.whenSettled(() => {});
    st.settleNow();
  } else {
    live?.destroy();
    root.append(gateBlock(h('p', { class: 'empty' }, t('gate.empty')), tally));
  }

  root.append(modelPanel(r, calls));

  root.append(h('div', { class: 'section-head' }, h('h2', {}, t('verified.title')), h('p', {}, t('verified.sub'))));
  const order = { issue: 0, risk: 1, good: 2 };
  if (!r.verified.length) root.append(h('p', { class: 'empty' }, t('verified.none')));
  for (const c of [...r.verified].sort((a, b) => order[a.tone] - order[b.tone])) root.append(claimCard(c));

  if (r.dropped.length) {
    root.append(h('div', { class: 'section-head' }, h('h2', {}, t('dropped.title')), h('p', {}, t('dropped.sub'))));
    for (const c of r.dropped) root.append(claimCard(c));
  }

  root.append(h('div', { class: 'section-head' }, h('h2', {}, t('pitch.title')), h('p', {}, t('pitch.sub'))));
  root.append(pitchBlock(r));
}

function renderShare() {
  const slot = document.getElementById('share-slot');
  if (!slot || !run?.share) return;
  const url = `${location.origin}${run.share.path}`;
  const days = run.share.days || 14;
  const field = h('input', { class: 'share-url', type: 'text', readonly: true, value: url, 'aria-label': t('share.aria'), onfocus: (e) => e.target.select() });
  const status = h('span', { class: 'share-status', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
    try { await navigator.clipboard.writeText(url); status.textContent = t('share.copied'); } catch { field.focus(); field.select(); status.textContent = t('share.pressCopy'); }
    setTimeout(() => { status.textContent = ''; }, 2400);
  } }, t('share.copy'));
  slot.replaceChildren(h('div', { class: 'share' },
    h('div', { class: 'share-row' }, field, btn),
    h('p', { class: 'share-note' }, t('share.note', { days: num(days) }), ' ', status)));
}

function claimCard(c) {
  const dropped = c.verdict === 'dropped';
  const label = dropped ? t('badge.dropped') : ['good', 'issue', 'risk'].includes(c.tone) ? t(`badge.${c.tone}`) : c.tone;
  const out = h('span', { class: 'rerun-result', role: 'status' });
  const list = h('ul', {}, c.evidence.map(evidenceRow));
  return h('div', { class: `claim ${dropped ? 'dropped' : c.tone}`, id: `claim-${c.id}`, tabindex: '-1' },
    h('div', { class: 'claim-top' }, h('h4', {}, c.statement), h('span', { class: `badge ${dropped ? 'dropped' : c.tone}` }, label)),
    !dropped && c.ownerText && c.ownerText !== c.statement ? h('p', { class: 'owner' }, t('claim.forOwner', { text: c.ownerText })) : null,
    dropped ? h('p', { class: 'why' }, h('b', {}, t('claim.whyDropped')), c.dropReason) : null,
    dropped && c.rationale ? h('p', { class: 'why' }, t('claim.modelReason', { text: c.rationale })) : null,
    h('details', { class: 'proof' },
      h('summary', {}, h('span', { class: 'lbl' }, t('proof.label', { n: c.evidence.length })), h('span', { class: 'muted' }, t('proof.checked', { time: time(c.checkedAt) }))),
      list,
      h('button', { class: 'rerun', type: 'button', onclick: (ev) => rerun(c, list, out, ev.currentTarget) }, t('proof.rerun')), out));
}

function evidenceRow(e) {
  const mark = e.skipped ? h('span', { class: 'mark na' }, '–') : e.matched ? h('span', { class: 'mark ok' }, '✓') : h('span', { class: 'mark no' }, '✗');
  return h('li', {}, mark,
    h('div', {}, e.skipped ? `${e.title} — ${e.summary}` : e.pass === null ? t('proof.notChecked', { title: e.title, summary: e.summary }) : t(e.expect ? 'proof.expectPass' : 'proof.expectFail', { title: e.title, summary: e.summary }), h('code', {}, `${e.check}(${JSON.stringify(e.params)})`)));
}

async function rerun(c, list, out, btn) {
  btn.disabled = true;
  btn.textContent = t('proof.running');
  out.textContent = '';
  try {
    const res = await fetch('/api/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, claimId: c.id }) });
    const r = await res.json().catch(() => ({ error: t('proof.unreadable') }));
    if (r.error) { out.textContent = serverText(r.error); return; }
    list.replaceChildren(...r.evidence.map(evidenceRow));
    const verdict = r.verdict === 'verified' || r.verdict === 'dropped' ? t(`verdict.${r.verdict}`) : r.verdict;
    out.textContent = r.verdict === c.verdict ? t('proof.same', { time: time(r.checkedAt) }) : t('proof.changed', { verdict, time: time(r.checkedAt) });
  } catch { out.textContent = t('proof.unreachable'); } finally { btn.disabled = false; btn.textContent = t('proof.rerun'); }
}

function pitchBlock(r) {
  const p = r.pitch;
  const cite = (id) => h('button', { type: 'button', class: 'cite', title: t('pitch.cite'), 'aria-label': t('pitch.citeFor', { id }), onclick: () => {
    const el = document.getElementById(`claim-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('details').open = true;
    el.focus({ preventScroll: true });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  } }, h('span', { class: 'cite-in' }, id));
  if (!p.opening && !p.findings.length && !p.offer) {
    return h('section', { class: 'block pitch' }, h('p', { class: 'muted' }, t('pitch.none')));
  }
  const text = [p.subject && `Subject: ${p.subject}`, '', p.opening, '', ...p.findings.map((f) => `- ${f.text}`), '', p.offer, '', p.closing].join('\n');
  const status = h('span', { class: 'share-status', role: 'status' });
  const copyBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(text); status.textContent = t('pitch.copied'); } catch { status.textContent = t('pitch.copyFailed'); }
    setTimeout(() => { status.textContent = ''; }, 2400);
  } }, t('pitch.copy'));
  return h('section', { class: 'block pitch' },
    p.subject ? h('div', { class: 'subject' }, t('pitch.subject', { text: p.subject })) : null,
    h('p', {}, p.opening),
    p.findings.length ? h('ul', {}, p.findings.map((f) => h('li', {}, f.text, ...f.cites.map(cite)))) : h('p', { class: 'muted' }, t('pitch.noIssues')),
    h('p', {}, p.offer), h('p', {}, p.closing),
    h('div', { class: 'actions' }, copyBtn, status),
    r.pitchRemoved?.length ? h('div', { class: 'removed' }, t('pitch.removed'), ...r.pitchRemoved.map((x) => h('span', {}, h('s', {}, x.text), ` (${x.reason}) `))) : null,
    h('p', { class: 'note' }, t('pitch.note')));
}

// ---- Shared, read-only report (/r/<id>) --------------------------------------------------------

const sharedWhen = (record) => t('shared.when', { kind: record.mode === 'sample' ? t('shared.sample') : t('shared.live'), when: when(record.at) });

async function openShared(id) {
  document.body.classList.add('shared');
  $('#mode').hidden = false;
  $('#mode').textContent = t('shared.pill');
  $('#shared-banner').hidden = false;
  resetWorkspace(t('shared.loadingReport'));
  let record = null;
  let problem = 'key:srv.reportMissing';
  if (SHARE_ID.test(id)) try {
    const res = await fetch(`/api/report/${id}`);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.events) record = body;
    else if (body?.error) problem = body.error;
  } catch { problem = 'key:shared.loadFailed'; }
  if (!record) { renderError(problem); run.ended = true; $('#shared-when').textContent = t('shared.unavailable'); return; }
  sharedRecord = record;
  $('#shared-when').textContent = sharedWhen(record);
  replaying = true;
  try { for (const e of record.events) dispatch(e.type, e); } finally { replaying = false; }
  run.share = { id: record.id, path: `/r/${record.id}`, at: record.at, days: 14 };
  renderShare();
  const last = record.events.find((e) => e.type === 'done')?.report;
  if (last) $('#clock').textContent = clock(last.stats.ms);
  finish();
}

// After a language switch: draw the finished run again from its recorded events, in the new language.
function replayRun() {
  if (!run) return;
  const events = run.events;
  const share = run.share;
  const error = run.error;
  stage?.destroy();
  stage = null;
  $('#events').replaceChildren();
  replaying = true;
  try {
    for (const e of events) { if (STAGE_OF[e.type]) setStage(STAGE_OF[e.type]); HANDLERS[e.type]?.(e); }
  } finally { replaying = false; }
  if (!run.share && share) run.share = share;
  if (run.report) { renderShare(); document.querySelectorAll('#stages li').forEach((li) => { li.classList.add('done'); li.classList.remove('active'); }); }
  else if (error) renderError(error.msg, error.query);
}

setupTour({ button: $('#tour-btn'), t, onLangChange });
boot();
