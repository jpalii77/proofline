// The gate visual: claim cards travel through three gate posts. A claim whose proof holds passes
// every post and lands on top of the "verified" list; a claim whose proof fails stops at the post
// that caught it, gets a "no proof" stamp, turns grey and drops onto the "dropped" list.
// Plain DOM + one requestAnimationFrame loop, transforms only. Outcomes come from the caller's
// lanes (see gate-data.js); this file only decides where and when things are drawn.
//
// Two rules keep every frame clean:
//  - one card on the track at a time: the next card only leaves the queue when the one before it
//    is about to clear the track, so cards never overlap in flight;
//  - lists are feeds: a landing card takes the top slot and the cards below slide down to make
//    room, so a falling card never crosses a card that already landed.
// The landing loop (loop: true) runs the same claims forever with no empty frame: it starts with
// the lists already filled by the previous round, and each list keeps its newest N cards.

import { GATES } from './gate-data.js';

const prefersReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
  lin: (t) => t,
};
export const LEAD = 320; // the next card may start this long before the track is clear (it barely moves yet)

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---- Layout ------------------------------------------------------------------------------------

// Wide: queue top-left, three posts in the middle, verified list on the right; dropped cards land
// in a list on the left, below the queue (they never got through).
// Narrow (< 480 px): the run through the posts on top, two lists below: dropped left, verified right.
// mode: 'run' (a live run; the frame grows as lists fill), 'loop' (landing; fixed frame),
// 'settled' (the final frame of a run, no queue, as compact as its lists allow).
// rows: how many cards each list must hold.
export function layoutFor(W, H, rows, mode) {
  const settled = mode === 'settled';
  const kept = Math.max(rows.kept, 1);
  const dropped = Math.max(rows.dropped, 1);
  if (W >= 480) {
    const cardW = clamp(Math.round(W * 0.31), 156, 212);
    const cardH = 60;
    const chipH = 50;
    const gap = 10;
    const step = chipH + gap;
    const top = 32;
    const track = top + 6;
    const mid = W - 2 * cardW;
    const gx = [0.14, 0.5, 0.86].map((f) => Math.round(cardW + mid * f));
    const colX = W - cardW;
    const dropTop = settled ? track : track + cardH + 48;
    // the landing loop spreads its lists over the frame's height
    const dropStep = mode === 'loop' && dropped > 1 ? clamp((H - 16 - dropTop - chipH) / (dropped - 1), step, step + 18) : step;
    const dropEnd = dropTop + (dropped - 1) * dropStep + chipH;
    // the landing loop spreads its verified list to end level with the dropped one
    const keptStep = mode === 'loop' && kept > 1 ? clamp((dropEnd - track - chipH) / (kept - 1), step, step + 22) : step;
    const keptEnd = track + (kept - 1) * keptStep + chipH;
    const need = Math.max(keptEnd, dropEnd, track + cardH) + 14;
    const fullH = settled ? need : Math.max(H, need);
    return {
      axis: 'x', W, H: fullH, cardW, cardH, chipH,
      queue: (i) => ({ x: i * 7, y: track - i * 7 }),
      track,
      kept: (k) => ({ x: colX, y: track + k * keptStep, w: cardW }),
      dropped: (d) => ({ x: 0, y: dropTop + d * dropStep, w: cardW }),
      gates: gx.map((x) => ({ x, y: top - 8, w: 18, h: fullH - top + 2 })),
      labelY: 4,
      labels: { queue: { x: 0, y: 6 }, kept: { x: colX, y: 6 }, dropped: { x: 0, y: settled ? 6 : dropTop - 24 } },
      speed: W / 2000,
    };
  }
  const cardW = Math.round(clamp(W * 0.39, 112, 150));
  const cardH = 56;
  const chipH = 48;
  const gap = 8;
  const step = chipH + gap;
  const top = 26;
  const track = top + 10;
  const gx = [0.46, 0.63, 0.8].map((f) => Math.round(W * f));
  const listTop = track + cardH + 52;
  const colW = Math.floor((W - 10) / 2);
  const need = listTop + Math.max(kept, dropped) * step - gap + 10;
  const fullH = settled ? need : Math.max(H, need);
  return {
    axis: 'm', W, H: fullH, cardW, cardH, chipH,
    queue: (i) => ({ x: i * 6, y: track - i * 6 }),
    track,
    exit: { x: W - cardW, y: track },
    kept: (k) => ({ x: W - colW, y: listTop + k * step, w: colW }),
    dropped: (d) => ({ x: 0, y: listTop + d * step, w: colW }),
    gates: gx.map((x) => ({ x, y: top - 6, w: 14, h: cardH + 32 })),
    labelY: 2,
    labels: { queue: { x: 0, y: 2 }, kept: { x: W - colW, y: listTop - 24 }, dropped: { x: 0, y: listTop - 24 } },
    speed: W / 1800,
  };
}

// ---- Choreography: one card's path as timed segments --------------------------------------------
// Every path ends in the top slot of its list; the feed offset (see render) moves it down later.
// leave   = when the card clears the track (the next card may follow)
// reserve = when its list makes room for it (the cards below start sliding down)

export function planFor(lane, L, tilt = 0) {
  const segs = [];
  const marks = [];
  const lit = [];
  let t = 0;
  let at = { ...L.queue(0), r: 0, s: 1 };
  const go = (to, ms, fn = ease.inOut) => { segs.push({ a: t, b: t + ms, from: at, to, fn }); t += ms; at = to; };
  const hold = (ms) => { segs.push({ a: t, b: t + ms, from: at, to: at, fn: ease.lin }); t += ms; };
  const dur = (p, lo, hi) => clamp(Math.hypot(p.x - at.x, p.y - at.y) / L.speed, lo, hi);
  const G = L.gates;
  let rejectAt = null;
  let leave = null;
  let reserve = null;

  if (lane.verdict === 'dropped') {
    const g = lane.dropAt ?? G.length - 1;
    // stopped at the face of the post that holds the failing check: it never gets through
    const face = { x: G[g].x - G[g].w / 2 - L.cardW - 4, y: L.track, r: 0, s: 1 };
    go(face, dur(face, 650, 2200), ease.inOut);
    rejectAt = t;
    lit.push({ g, a: t - 60, b: t + 900, kind: 'reject' });
    hold(280);
    marks.push({ t, state: 'dropped' });
    hold(620);
    go({ x: at.x - 6, y: at.y + 8, r: tilt * 2.5, s: 0.98 }, 220, ease.out);
    reserve = t;
    const d0 = L.dropped(0);
    go({ x: d0.x, y: d0.y, r: tilt, s: 1 }, 760, ease.in);
    marks.push({ t, state: 'settled', w: d0.w });
  } else {
    if (L.exit) { go({ ...L.exit, r: 0, s: 1 }, dur(L.exit, 900, 2200), ease.inOut); reserve = t; }
    const k = L.kept(0);
    const to = { x: k.x, y: k.y, r: 0, s: 1 };
    go(to, dur(to, L.exit ? 520 : 1200, 2400), ease.inOut);
    marks.push({ t, state: 'settled', w: k.w });
  }
  const end = t;
  // post light: sample the path; a post glows while a card it checks is inside it
  let passedAll = null;
  let cleared = null;
  const open = {};
  const last = G[G.length - 1];
  for (let u = 0; u <= end; u += 20) {
    const p = sample({ segs }, u);
    for (let g = 0; g < G.length; g++) {
      const inside = p.x + L.cardW > G[g].x - G[g].w / 2 && p.x < G[g].x + G[g].w / 2 && Math.abs(p.y - L.track) < L.cardH;
      const checks = lane.touches.includes(g) && (rejectAt == null || u < rejectAt - 60);
      if (inside && checks) { if (open[g] == null) open[g] = u; }
      else if (open[g] != null) { lit.push({ g, a: open[g], b: u + 160, kind: 'pass' }); open[g] = null; }
    }
    const passX = L.exit ? L.exit.x - 2 : last.x + last.w / 2 - L.cardW * 0.35;
    if (passedAll == null && lane.verdict === 'verified' && p.x >= passX) passedAll = u;
    if (cleared == null && lane.verdict === 'verified' && !L.exit && p.x > last.x + last.w / 2 + 2) cleared = u;
    // a dropped card has left the track once it has fallen below it
    if (leave == null && (lane.verdict === 'dropped' || L.exit) && reserve != null && u >= reserve && p.y - L.track >= L.cardH + 2) leave = u;
  }
  for (const g of Object.keys(open)) if (open[g] != null) lit.push({ g: Number(g), a: open[g], b: end, kind: 'pass' });
  if (leave == null && (lane.verdict === 'dropped' || L.exit)) leave = end;
  if (lane.verdict === 'verified') {
    marks.unshift({ t: passedAll ?? end - 300, state: 'kept' });
    if (leave == null) leave = cleared ?? end;
    if (reserve == null) reserve = Math.max(0, end - 650);
  }
  return { segs, lit, marks, end, leave, reserve };
}

export function sample(plan, t) {
  const segs = plan.segs;
  if (!segs.length) return null;
  if (t <= segs[0].a) return segs[0].from;
  for (const s of segs) {
    if (t <= s.b) {
      const u = s.b === s.a ? 1 : s.fn(clamp((t - s.a) / (s.b - s.a), 0, 1));
      return { x: s.from.x + (s.to.x - s.from.x) * u, y: s.from.y + (s.to.y - s.from.y) * u, r: s.from.r + (s.to.r - s.from.r) * u, s: s.from.s + (s.to.s - s.from.s) * u };
    }
  }
  return segs[segs.length - 1].to;
}

// ---- Stage -------------------------------------------------------------------------------------

/**
 * createGateStage({ loop, onPick, ariaLabel, spacing, instant })
 *   .el                     the stage element
 *   .seed([{id, label, mini, statement}])  proposed claims wait in the queue before their verdict
 *   .add(lane)              a gate verdict: the card starts its run (loop: one lane of the loop)
 *   .whenSettled(fn)        fn once every added lane has landed (after .close())
 *   .close()                no more lanes will come (loop: start looping)
 *   .settleNow()            jump to the final composed frame
 *   .destroy()
 */
export function createGateStage({ loop = false, onPick = null, ariaLabel = '', spacing = 820, instant: startInstant = false } = {}) {
  const root = el('div', `gate-stage${loop ? ' loop' : ''}`);
  if (ariaLabel) { root.setAttribute('role', 'img'); root.setAttribute('aria-label', ariaLabel); }
  const field = el('div', 'gs-field');
  field.setAttribute('aria-hidden', ariaLabel ? 'true' : 'false');
  root.append(field);

  const lblQueue = el('span', 'gs-zone gs-zone-q', 'Proposed');
  const lblKept = el('span', 'gs-zone gs-zone-k', 'Verified');
  const lblDrop = el('span', 'gs-zone gs-zone-d', 'Dropped · no proof');
  const keptCount = el('b', 'gs-count', '0');
  const dropCount = el('b', 'gs-count', '0');
  lblKept.append(' ', keptCount);
  lblDrop.append(' ', dropCount);
  const gates = GATES.map((g) => {
    const pane = el('div', 'gs-gate');
    const label = el('span', 'gs-gate-label', g.label);
    pane.title = `${g.label}: ${g.checks.join(', ')}`;
    field.append(pane, label);
    return { pane, label };
  });
  field.append(lblQueue, lblKept, lblDrop);

  let W = 0;
  let H = 0;
  let L = null;
  let cards = [];
  const lanes = []; // loop: the lanes that repeat
  let seq = null; // loop timing: { T: [start offsets], P: period, plans }
  let clock = 0;
  let last = null;
  let raf = 0;
  let paused = false;
  let hidden = false;
  let offscreen = false;
  let closed = false;
  let settledFn = null;
  let instant = startInstant || prefersReduced();
  let settledLayout = false;
  let snap = true; // next render places feed offsets without easing
  let lastDt = 16;

  const rowsNow = () => {
    if (loop) return { kept: lanes.filter((l) => l.verdict === 'verified').length, dropped: lanes.filter((l) => l.verdict === 'dropped').length };
    return { kept: cards.filter((c) => c.lane?.verdict === 'verified').length, dropped: cards.filter((c) => c.lane?.verdict === 'dropped').length };
  };

  function makeCard(id, label, mini, statement) {
    const node = el('div', 'gs-card');
    const icon = el('span', 'gs-icon');
    icon.setAttribute('aria-hidden', 'true');
    const text = el('span', 'gs-text');
    const full = el('span', 'gs-full', label);
    const short = el('span', 'gs-mini', mini || label);
    text.append(full, short);
    const stamp = el('span', 'gs-stamp', 'no proof');
    const tip = el('span', 'gs-tip');
    node.append(icon, text, stamp, tip);
    if (statement) node.title = statement;
    node.style.opacity = '0';
    field.append(node);
    return { id, node, full, short, tip, lane: null, plan: null, start: null, state: '', tilt: 0, off: null, rank: 0, goneAt: null };
  }

  function dress(c) {
    c.node.dataset.verdict = c.lane.verdict;
    c.full.textContent = c.lane.label;
    c.short.textContent = c.lane.mini || c.lane.label;
    if (c.lane.reason) c.tip.textContent = c.lane.reason;
    c.node.title = c.lane.statement || '';
  }

  // ---- loop timing: lane i of round k starts at k * P + T[i]
  function buildLoop() {
    const n = lanes.length;
    if (!n || !L) { seq = null; return; }
    const plans = lanes.map((l, i) => [planFor(l, L, i % 2 ? 1.2 : -1)]);
    const T = [0];
    for (let i = 0; i < n; i++) T.push(T[i] + Math.max(plans[i][0].leave - LEAD, Math.min(spacing, 700)));
    seq = { T, P: T[n], plans };
  }
  const startOf = (k) => Math.floor(k / lanes.length) * seq.P + seq.T[((k % lanes.length) + lanes.length) % lanes.length];

  // keep the loop's live instances: the last round still on the lists, the one in flight, the queue
  function syncLoop() {
    if (!seq) return;
    const n = lanes.length;
    let hi = Math.floor(clock / seq.P) * n;
    while (startOf(hi + 1) <= clock) hi++;
    while (startOf(hi) > clock) hi--;
    const lo = hi - n - 3;
    cards = cards.filter((c) => {
      const old = c.k < lo || (c.goneAt != null && clock - c.goneAt > 700);
      if (old) c.node.remove();
      return !old;
    });
    for (let k = Math.max(lo, 0); k <= hi + 4; k++) {
      if (cards.some((c) => c.k === k)) continue;
      const lane = lanes[k % n];
      const c = makeCard(`${lane.id}#${k}`, lane.label, lane.mini, lane.statement);
      c.k = k;
      c.lane = lane;
      c.start = startOf(k);
      c.plan = seq.plans[k % n][0];
      dress(c);
      cards.push(c);
    }
    cards.sort((a, b) => a.k - b.k);
  }

  function measure() {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    W = r.width; H = r.height;
    const mode = settledLayout ? 'settled' : loop ? 'loop' : 'run';
    L = layoutFor(W, H, rowsNow(), mode);
    root.dataset.axis = L.axis;
    root.style.setProperty('--card-w', `${L.cardW}px`);
    root.style.setProperty('--card-h', `${L.cardH}px`);
    root.style.setProperty('--chip-h', `${L.chipH}px`);
    L.gates.forEach((g, i) => {
      const { pane, label } = gates[i];
      pane.style.transform = `translate(${g.x - g.w / 2}px, ${g.y}px)`;
      pane.style.width = `${g.w}px`;
      pane.style.height = `${g.h}px`;
      const gap = L.gates[1].x - L.gates[0].x;
      label.textContent = gap >= 104 ? GATES[i].label : GATES[i].short;
      label.classList.toggle('tight', gap < 64);
      label.style.transform = `translate(calc(${g.x}px - 50%), ${L.labelY}px)`;
    });
    const place = (n, p) => { n.style.transform = `translate(${p.x}px, ${p.y}px)`; };
    place(lblQueue, L.labels.queue); place(lblKept, L.labels.kept); place(lblDrop, L.labels.dropped);
    // wide: the verified label hugs the right edge, clear of the last post's label
    if (L.axis === 'x') lblKept.style.transform = `translate(calc(${W}px - 100%), ${L.labels.kept.y}px)`;
    lblQueue.hidden = L.axis === 'm' || settledLayout || (instant && !loop);
    if (settledLayout) root.style.height = `${Math.ceil(L.H)}px`;
    else if (!loop && L.H > H + 1) root.style.height = `${Math.ceil(L.H)}px`; // a run's frame only grows
    if (loop) {
      const had = seq?.P;
      buildLoop();
      if (seq && had && had !== seq.P && loopStarted) { clock = (clock / had) * seq.P; for (const c of cards) c.node.remove(); cards = []; }
    } else {
      for (const c of cards) if (c.lane && c.start != null) c.plan = planFor(c.lane, L, c.tilt);
    }
    snap = true;
    return true;
  }

  function schedule(c) {
    const prev = cards.filter((d) => d !== c && d.start != null).sort((a, b) => b.start - a.start)[0];
    c.tilt = rowsNow().dropped % 2 ? 1.2 : -1;
    if (L) c.plan = planFor(c.lane, L, c.tilt);
    let at = clock;
    if (prev) at = Math.max(at, prev.start + Math.max(prev.plan ? prev.plan.leave - LEAD : spacing, 380));
    c.start = at;
    dress(c);
    if (L && !loop) {
      // the lists may need more room: grow the frame before the card lands
      const need = layoutFor(W, H, rowsNow(), 'run').H;
      if (need > H + 1) { root.style.height = `${Math.ceil(need)}px`; H = need; }
    }
  }

  // feed rank: newest landing first
  function rank() {
    for (const verdict of ['verified', 'dropped']) {
      const list = cards.filter((c) => c.lane?.verdict === verdict && c.start != null && c.plan && clock >= c.start + c.plan.reserve);
      list.sort((a, b) => (b.start + b.plan.reserve) - (a.start + a.plan.reserve));
      list.forEach((c, i) => { c.rank = i; });
    }
  }

  function render() {
    if (!L) return false;
    if (loop) {
      if (!seq) return false;
      if (!loopStarted) { loopStarted = true; clock = seq.P + 700; snap = true; }
      syncLoop();
    }
    rank();
    const caps = loop ? rowsNow() : null;
    const lit = [0, 0, 0];
    let busy = false;
    const k = snap ? 1 : 1 - Math.exp(-lastDt / 110);
    const queueOrder = cards.filter((c) => c.start == null || clock < c.start).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
    for (const c of cards) {
      let pos;
      let state = 'queued';
      let opacity = 1;
      let z = 12;
      if (c.start == null || clock < c.start) {
        const q = queueOrder.indexOf(c);
        pos = { ...L.queue(Math.min(q, 2)), r: 0, s: 1 };
        opacity = q > 2 ? 0 : 1 - q * 0.26;
        z = 10 - Math.min(q, 5);
        busy = busy || c.start != null;
        c.off = null;
      } else {
        const t = clock - c.start;
        state = 'moving';
        pos = { ...sample(c.plan, t) };
        for (const m of c.plan.marks) if (t >= m.t) state = m.state === 'settled' ? (c.lane.verdict === 'verified' ? 'kept settled' : 'dropped settled') : m.state;
        for (const w of c.plan.lit) if (t >= w.a && t <= w.b) lit[w.g] = w.kind === 'reject' ? 2 : Math.max(lit[w.g], 1);
        if (t < c.plan.end) busy = true;
        if (t >= c.plan.reserve) {
          const col = c.lane.verdict === 'verified' ? L.kept : L.dropped;
          const cap = caps ? (c.lane.verdict === 'verified' ? caps.kept : caps.dropped) : Infinity;
          const r = Math.min(c.rank, cap - 1);
          const a = col(0);
          const b = col(r);
          const target = { x: b.x - a.x, y: b.y - a.y };
          if (!c.off) c.off = snap ? { ...target } : { x: 0, y: 0 };
          c.off.x += (target.x - c.off.x) * k;
          c.off.y += (target.y - c.off.y) * k;
          if (Math.abs(target.y - c.off.y) > 0.5) busy = true;
          pos.x += c.off.x; pos.y += c.off.y;
          if (c.rank >= cap) { opacity = 0; state += ' gone'; if (c.goneAt == null) c.goneAt = clock; }
        }
        // a stopped card comes in front of the posts, so its stamp is never behind glass
        z = state.includes('settled') ? 3 : state === 'dropped' ? 24 : 12;
        const sm = c.plan.marks.find((m) => m.state === 'settled');
        if (sm && t >= sm.t) c.node.style.setProperty('--chip-w', `${sm.w}px`);
      }
      if (c.state !== state) { c.node.className = `gs-card ${state}`; c.state = state; }
      c.node.style.opacity = String(opacity);
      c.node.style.zIndex = String(z);
      c.node.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${(pos.r || 0).toFixed(2)}deg) scale(${(pos.s ?? 1).toFixed(3)})`;
    }
    snap = false;
    gates.forEach((g, i) => { g.pane.classList.toggle('lit', lit[i] === 1); g.pane.classList.toggle('reject', lit[i] === 2); });
    const settledKept = cards.filter((c) => c.state === 'kept settled').length;
    const settledDrop = cards.filter((c) => c.state === 'dropped settled').length;
    keptCount.textContent = String(settledKept);
    dropCount.textContent = String(settledDrop);
    root.classList.toggle('has-drop', loop || settledDrop > 0);
    return busy;
  }

  function settledAll() {
    return !loop && closed && cards.every((c) => c.lane && c.start != null && c.plan && clock >= c.start + c.plan.end);
  }

  function finishIfDone() {
    if (!settledFn || !settledAll()) return;
    const fn = settledFn; settledFn = null;
    root.classList.add('settled');
    makeInteractive();
    fn();
  }

  function frame(ts) {
    raf = 0;
    if (last == null) last = ts;
    const dt = Math.min(64, ts - last);
    last = ts;
    lastDt = dt || 16;
    if (!paused && !hoverPaused && !hidden && !offscreen) clock += dt;
    if (!L && !measure()) { raf = requestAnimationFrame(frame); return; }
    if (loop && !seq) { if (closed) buildLoop(); if (!seq) { raf = requestAnimationFrame(frame); return; } }
    const busy = render();
    finishIfDone();
    if (busy || loop || !settledAll()) raf = requestAnimationFrame(frame);
  }

  function kick() { if (!raf && !instant) { last = null; raf = requestAnimationFrame(frame); } }

  // the loop opens mid-round: the previous round already fills both lists, a card is in flight
  let loopStarted = false;
  function startLoop() {
    if (instant) { if (L || measure()) render(); } else kick();
  }

  function settleNow() {
    if (loop) { instant = true; cancelAnimationFrame(raf); raf = 0; if (L || measure()) { snap = true; render(); } return; }
    instant = true;
    if (!settledLayout) {
      // the final frame drops the empty queue zone; cards glide to their places
      settledLayout = true;
      if (L) { root.classList.add('reflow'); setTimeout(() => root.classList.remove('reflow'), 900); }
      L = null;
    }
    if (!L && !measure()) return;
    for (const c of cards) if (c.lane && c.start == null) schedule(c);
    for (const c of cards) if (c.lane && c.start != null) c.plan = planFor(c.lane, L, c.tilt);
    const end = Math.max(0, ...cards.filter((c) => c.plan).map((c) => c.start + Math.max(c.plan.end, c.plan.reserve)));
    clock = end + 1;
    cancelAnimationFrame(raf); raf = 0;
    snap = true;
    render();
    finishIfDone();
  }

  function makeInteractive() {
    if (!onPick) return;
    for (const c of cards) {
      if (!c.lane || c.node.tagName === 'BUTTON') continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = c.node.className;
      b.style.cssText = c.node.style.cssText;
      b.title = c.node.title;
      b.dataset.verdict = c.node.dataset.verdict;
      b.setAttribute('aria-label', `${c.lane.verdict === 'verified' ? 'Verified' : 'Dropped'}: ${String(c.lane.statement).replace(/\.$/, '')}${c.lane.reason ? `. Why dropped: ${c.lane.reason}` : ''}. Show its proof.`);
      b.append(...c.node.childNodes);
      const lane = c.lane;
      b.addEventListener('click', () => onPick(lane));
      c.node.replaceWith(b);
      c.node = b;
    }
    field.removeAttribute('aria-hidden');
  }

  // pause on hover, when off-screen, and when the tab is hidden
  // (only the looping landing visual: a run must never stall because the pointer rests on it)
  let hoverPaused = false;
  if (loop) {
    root.addEventListener('mouseenter', () => { hoverPaused = true; root.classList.add('hovering'); });
    root.addEventListener('mouseleave', () => { hoverPaused = false; root.classList.remove('hovering'); kick(); });
  }
  const onVis = () => { hidden = document.hidden; };
  document.addEventListener('visibilitychange', onVis);
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((ents) => { for (const e of ents) { offscreen = !e.isIntersecting; if (!offscreen) kick(); } });
    if (loop) io.observe(root); // only the looping landing visual rests while off-screen; a run never waits for a scroll
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    let lastW = 0;
    ro = new ResizeObserver(() => {
      const w = root.getBoundingClientRect().width;
      if (Math.abs(w - lastW) < 1 && L) return; // our own height changes do not need a re-layout
      lastW = w;
      if (!measure()) return;
      if (instant) settleNow(); else if (!raf) render();
    });
    ro.observe(root);
  }

  return {
    el: root,
    seed(list) {
      if (loop) return;
      for (const p of list) if (!cards.some((c) => c.id === p.id)) cards.push(makeCard(p.id, p.label, p.mini, p.statement));
      if (instant) { if (measure()) render(); } else kick();
    },
    add(lane) {
      if (loop) { lanes.push(lane); return; }
      let c = cards.find((x) => x.id === lane.id && !x.lane);
      if (!c) { c = makeCard(lane.id, lane.label, lane.mini, lane.statement); cards.push(c); }
      c.lane = lane;
      schedule(c);
      if (instant) settleNow(); else kick();
    },
    close() {
      closed = true;
      if (loop) { startLoop(); return; }
      if (instant) settleNow(); else kick();
    },
    whenSettled(fn) { settledFn = fn; if (instant) settleNow(); else { finishIfDone(); kick(); } },
    settleNow,
    setPaused(v) { paused = v; root.classList.toggle('paused', v); if (!v) kick(); },
    get paused() { return paused; },
    destroy() { cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', onVis); root.remove(); },
  };
}
