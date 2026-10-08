// "How it works": an optional four-step tour. It never opens by itself. On a visitor's first page
// view the button pulses once (a static ring under reduced motion), and never again after that.
// Each step dims the page and lights up the part it talks about; Esc closes, arrow keys move.
// No DOM work at import time (the step list and the "nudge once" rule are tested in Node).

export const NUDGE_KEY = 'proofline.tourNudged';

// targets: the first one that is on screen is lit; the page can be the landing page, a finished
// run or a shared report, so each step names a fallback. None on screen: the step is shown centred.
export const STEPS = [
  { id: 'what', title: 'tour.s1.title', body: 'tour.s1.body', targets: ['.hero-copy h1', '#shared-banner'] },
  { id: 'start', title: 'tour.s2.title', body: 'tour.s2.body', targets: ['.hero-ask', '#shared-banner'] },
  { id: 'gate', title: 'tour.s3.title', body: 'tour.s3.body', targets: ['.gate-block', '#hero-visual'] },
  { id: 'result', title: 'tour.s4.title', body: 'tour.s4.body', targets: ['.block.card', '#samples'] },
];

/** True only the first time it is asked on this browser (false when storage is missing or blocked). */
export function nudgeOnce(storage) {
  try {
    if (!storage || storage.getItem(NUDGE_KEY)) return false;
    storage.setItem(NUDGE_KEY, '1');
    return true;
  } catch { return false; }
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/**
 * Wires the tour button. Only listens: nothing is drawn until the button is pressed.
 * t: the i18n text function; onLangChange: subscribe to language switches.
 */
export function setupTour({ button, t, onLangChange = () => {}, storage = safeStorage(), doc = globalThis.document, win = globalThis.window }) {
  if (!button) return { open() {}, close() {}, isOpen: () => false };
  const reduced = () => !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (nudgeOnce(storage)) {
    button.classList.add('nudge');
    const stop = () => button.classList.remove('nudge');
    button.addEventListener('animationend', stop, { once: true });
    win?.setTimeout?.(stop, 4500); // reduced motion: the static ring goes after a few seconds
  }

  let ui = null; // { root, spot, pop, ... } while open
  let index = 0;

  const visible = (el) => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const targetOf = (step) => step.targets.map((s) => doc.querySelector(s)).find(visible) || null;

  function el(tag, attrs = {}, ...kids) {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids);
    return n;
  }

  function place() {
    if (!ui) return;
    const target = targetOf(STEPS[index]);
    const vw = win.innerWidth;
    const vh = win.innerHeight;
    const pad = 8;
    const phone = vw < 640;
    const { spot, pop } = ui;
    if (target) {
      const r = target.getBoundingClientRect();
      const top = Math.max(r.top - pad, 4);
      const left = Math.max(r.left - pad, 4);
      const bottom = Math.min(r.bottom + pad, vh - 4);
      const right = Math.min(r.right + pad, vw - 4);
      spot.hidden = false;
      Object.assign(spot.style, { top: `${top}px`, left: `${left}px`, width: `${Math.max(right - left, 0)}px`, height: `${Math.max(bottom - top, 0)}px` });
    } else spot.hidden = true;

    pop.classList.toggle('sheet', phone);
    if (phone) { Object.assign(pop.style, { top: '', left: '', bottom: '', width: '' }); return; }
    const w = Math.min(380, vw - 32);
    const h = pop.offsetHeight;
    let top;
    let left;
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.bottom + pad + 12 + h < vh) top = r.bottom + pad + 12;
      else if (r.top - pad - 12 - h > 0) top = r.top - pad - 12 - h;
      if (top != null) left = r.left;
      else if (r.right + pad + 12 + w < vw) { left = r.right + pad + 12; top = Math.min(Math.max(r.top, 16), vh - h - 16); }
      else if (r.left - pad - 12 - w > 0) { left = r.left - pad - 12 - w; top = Math.min(Math.max(r.top, 16), vh - h - 16); }
    }
    if (top == null) { top = vh - h - 24; left = (vw - w) / 2; }
    left = Math.min(Math.max(left, 16), vw - w - 16);
    Object.assign(pop.style, { width: `${w}px`, top: `${Math.max(top, 16)}px`, left: `${left}px`, bottom: '' });
  }

  let frame = 0;
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; place(); }); };

  function render(focusNext = false) {
    const step = STEPS[index];
    const last = index === STEPS.length - 1;
    ui.count.textContent = t('tour.step', { i: index + 1, n: STEPS.length });
    ui.title.textContent = t(step.title);
    ui.body.textContent = t(step.body);
    ui.prev.disabled = index === 0;
    ui.prev.textContent = t('tour.prev');
    ui.next.textContent = last ? t('tour.done') : t('tour.next');
    ui.close.setAttribute('aria-label', t('tour.close'));
    ui.close.title = t('tour.close');
    ui.pop.setAttribute('aria-label', t('tour.dialog'));
    ui.dots.replaceChildren(...STEPS.map((_, i) => el('i', { class: i === index ? 'on' : '' })));
    ui.live.textContent = `${t('tour.step', { i: index + 1, n: STEPS.length })}: ${t(step.title)}`;
    const target = targetOf(step);
    if (target) {
      const phone = win.innerWidth < 640;
      target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: phone ? 'start' : 'center' });
    }
    place();
    // follow the smooth scroll for a moment, then stay put
    const until = Date.now() + 700;
    const follow = () => { place(); if (ui && Date.now() < until) win.requestAnimationFrame(follow); };
    win.requestAnimationFrame(follow);
    if (focusNext || doc.activeElement === ui.prev && ui.prev.disabled) ui.next.focus();
  }

  function go(delta) {
    if (!ui) return;
    const next = index + delta;
    if (next >= STEPS.length) return close();
    if (next < 0) return;
    index = next;
    render();
  }

  function onKey(e) {
    if (!ui) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
    if (e.key === 'Tab') {
      const items = [...ui.pop.querySelectorAll('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && (doc.activeElement === first || !ui.pop.contains(doc.activeElement))) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && (doc.activeElement === lastItem || !ui.pop.contains(doc.activeElement))) { e.preventDefault(); first.focus(); }
    }
  }

  const outside = () => [...doc.body.children].filter((n) => n.nodeType === 1 && !n.classList.contains('tour'));

  function open() {
    if (ui) return;
    index = 0;
    button.classList.remove('nudge');
    const count = el('p', { class: 'tour-count' });
    const close_ = el('button', { type: 'button', class: 'tour-x', onclick: () => close() }, '×');
    const title = el('h2', { class: 'tour-title', id: 'tour-title' });
    const body = el('p', { class: 'tour-body', id: 'tour-body' });
    const prev = el('button', { type: 'button', class: 'btn ghost', onclick: () => go(-1) });
    const next = el('button', { type: 'button', class: 'btn primary', onclick: () => go(1) });
    const dots = el('span', { class: 'tour-dots', 'aria-hidden': 'true' });
    const live = el('p', { class: 'sr-only', 'aria-live': 'polite' });
    const pop = el('div', { class: 'tour-pop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-title', 'aria-describedby': 'tour-body', tabindex: '-1' },
      el('div', { class: 'tour-head' }, count, close_), title, body,
      el('div', { class: 'tour-foot' }, dots, el('span', { class: 'tour-nav' }, prev, next)), live);
    const spot = el('div', { class: 'tour-spot', 'aria-hidden': 'true' });
    const scrim = el('div', { class: 'tour-scrim', 'aria-hidden': 'true', onclick: () => close() });
    const root = el('div', { class: 'tour' }, scrim, spot, pop);
    const inerted = outside().filter((n) => !n.inert);
    for (const n of inerted) n.inert = true;
    doc.body.append(root);
    doc.body.classList.add('touring');
    ui = { root, spot, pop, count, close: close_, title, body, prev, next, dots, live, inerted };
    doc.addEventListener('keydown', onKey, true);
    win.addEventListener('resize', schedule, { passive: true });
    win.addEventListener('scroll', schedule, { passive: true });
    render(true);
  }

  function close() {
    if (!ui) return;
    for (const n of ui.inerted) n.inert = false;
    ui.root.remove();
    doc.body.classList.remove('touring');
    doc.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('scroll', schedule);
    ui = null;
    button.focus();
  }

  button.addEventListener('click', open);
  onLangChange(() => { if (ui) render(); });
  return { open, close, isOpen: () => !!ui };
}
