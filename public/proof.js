// The measurement page (/proof): every number comes from proof-data.js, which scripts/proof-data.mjs builds
// from docs/accuracy.md and the run and verdict files (a test keeps them in step). Nothing here is typed in.
import { detectLang, getLang, num, onLangChange, setLang } from './i18n.js';
import { PROOF } from './proof-data.js';
import { claimStatement } from './report-lang.js';

const TEXT = {
  en: {
    skip: 'Skip to every claim',
    back: 'Try the demo',
    title: 'Proofline — how often it is right',
    h1: 'How often is Proofline right?',
    lede: 'We ran the agent on real Turkish small businesses and checked every claim it kept by hand, outside Proofline. This page shows each one, the wrong ones too.',
    'stat.acc': 'of kept claims right on the last four fresh lists',
    'stat.accOf': '{a} of {b}',
    'stat.gate': 'wrong claims that reached a reader, all 19 rounds',
    'stat.gateOf': '({a} without the gate)',
    'stat.reports': 'reports with a wrong sentence, last four fresh lists',
    'stat.reportsOf': 'of {b} ({c} without the gate)',
    'final.h': 'The final round',
    'final.wait': 'A list of 12 businesses never seen before was committed on 20 October, before the run, and its hash is checked by a test. It runs once at code freeze; whatever it returns is shown here unchanged.',
    'final.list': 'The list',
    'final.why': 'Why it is frozen',
    'final.hash': 'SHA-256',
    'final.done': 'Run once on {day}: {a} of {b} kept claims right ({pct}%).',
    'final.more': '{w} wrong, {u} not settled, {d} dropped by the gate, across {n} businesses.',
    'final.run': 'The run',
    'final.verdicts': 'Hand checks',
    'claims.h': 'Every claim on the last four fresh lists',
    'claims.lede': '48 businesses the fixes were never made for. Each claim below is what the report said; next to it, what the hand check found.',
    'filter.label': 'Show',
    'filter.all': 'All claims',
    'filter.wrong': 'Wrong and unsettled',
    'filter.dropped': 'Dropped by the gate',
    'round.h': 'Round {n}',
    'round.sum': '{a} of {b} right',
    'round.file': 'verdict file',
    typed: 'Typed:',
    'mark.right': 'Right',
    'mark.wrong': 'Wrong',
    'mark.unsettled': 'Not settled',
    'mark.dropped': 'Dropped',
    'drop.false': 'rightly',
    'drop.true': 'a true claim lost',
    'drop.unknown': 'not settled',
    noteLang: '',
    empty: 'No claims in this view.',
    'search.h': 'Search on, search off, the model alone',
    'search.lede': 'The same 12 businesses, three ways.',
    'search.run': 'Run',
    'search.kept': 'Kept claims right',
    'search.sites': 'Own website found',
    'search.none': 'no claims',
    'rounds.h': 'All 19 rounds',
    'rounds.lede': 'A fresh list is 12 businesses never measured before. A repeat runs the same list again after the fixes, so only fresh lists count for the headline number.',
    'rounds.round': 'Round',
    'rounds.list': 'List',
    'rounds.fresh': 'Fresh',
    'rounds.repeat': 'Repeat',
    'rounds.proposed': 'Proposed',
    'rounds.dropped': 'Dropped by the gate',
    'rounds.right': 'Kept and right',
    'rounds.pct': 'Right',
    'method.h': 'How it was measured, and what it does not show',
    method: [
      'The live agent (Tavily, Nemotron on Nebius Token Factory, live checks) ran on lists of 12 real businesses from a web-services sales pipeline in Turkey: online shops, clinics, hotels, cafés, many typed by name only.',
      'Every kept claim was checked again by hand, outside Proofline (curl, openssl, the full page, the map, direct searches) and marked right or wrong. A claim the check could not settle is left out of the percentage and shown here as "not settled".',
      'Every error became a fix with a regression test, or a named limit. Each fix was then measured on a list it was not made for.',
      'What it does not show: the team chose the lists and did the checks; each round ran once; a business on the map under an older or other name is a known limit.',
    ],
    foot: 'Built for the Nebius × NVIDIA Global AI Hackathon',
    'foot.src': 'Full write-up on GitHub',
  },
  tr: {
    skip: 'Tüm iddialara geç',
    back: 'Demoyu dene',
    title: 'Proofline — ne kadar doğru',
    h1: 'Proofline ne kadar doğru?',
    lede: 'Ajanı gerçek Türk küçük işletmelerinde çalıştırdık ve tuttuğu her iddiayı Proofline dışında elle kontrol ettik. Bu sayfa hepsini gösteriyor, yanlış çıkanlar dahil.',
    'stat.acc': 'son dört taze listede tutulan iddiaların doğru çıkan payı',
    'stat.accOf': '{b} iddiadan {a}',
    'stat.gate': '19 turda okura ulaşan yanlış iddia',
    'stat.gateOf': '(kapı olmasaydı {a})',
    'stat.reports': 'son dört taze listede yanlış cümle taşıyan rapor',
    'stat.reportsOf': '/ {b} (kapı olmasaydı {c})',
    'final.h': 'Final turu',
    'final.wait': 'Daha önce hiç görülmemiş 12 işletmelik liste 20 Ekim’de, çalıştırılmadan önce kaydedildi; özetini bir test denetliyor. Kod dondurulunca bir kez çalışacak; ne çıkarsa burada değiştirilmeden gösterilecek.',
    'final.list': 'Liste',
    'final.why': 'Neden donduruldu',
    'final.hash': 'SHA-256',
    'final.done': '{day} tarihinde bir kez çalıştı: tutulan {b} iddiadan {a} tanesi doğru (%{pct}).',
    'final.more': '{n} işletmede {w} yanlış, {u} belirsiz; kapı {d} iddiayı attı.',
    'final.run': 'Çalıştırma',
    'final.verdicts': 'Elle kontroller',
    'claims.h': 'Son dört taze listedeki her iddia',
    'claims.lede': 'Düzeltmelerin hiç yapılmadığı 48 işletme. Her satırda raporun söylediği ve elle kontrolün bulduğu yan yana.',
    'filter.label': 'Göster',
    'filter.all': 'Tüm iddialar',
    'filter.wrong': 'Yanlış ve belirsiz',
    'filter.dropped': 'Kapının attıkları',
    'round.h': 'Tur {n}',
    'round.sum': '{b} iddiadan {a} doğru',
    'round.file': 'karar dosyası',
    typed: 'Yazılan:',
    'mark.right': 'Doğru',
    'mark.wrong': 'Yanlış',
    'mark.unsettled': 'Belirsiz',
    'mark.dropped': 'Atıldı',
    'drop.false': 'haklı olarak',
    'drop.true': 'doğru bir iddia kayboldu',
    'drop.unknown': 'belirsiz',
    noteLang: 'Kontrol notu (İngilizce)',
    empty: 'Bu görünümde iddia yok.',
    'search.h': 'Arama açık, arama kapalı, model tek başına',
    'search.lede': 'Aynı 12 işletme, üç farklı yolla.',
    'search.run': 'Çalıştırma',
    'search.kept': 'Doğru çıkan tutulan iddia',
    'search.sites': 'Bulunan kendi sitesi',
    'search.none': 'iddia yok',
    'rounds.h': '19 turun hepsi',
    'rounds.lede': 'Taze liste, daha önce hiç ölçülmemiş 12 işletmedir. Tekrar turu aynı listeyi düzeltmelerden sonra yeniden çalıştırır; baştaki sayı yalnız taze listelerden gelir.',
    'rounds.round': 'Tur',
    'rounds.list': 'Liste',
    'rounds.fresh': 'Taze',
    'rounds.repeat': 'Tekrar',
    'rounds.proposed': 'Önerilen',
    'rounds.dropped': 'Kapının attığı',
    'rounds.right': 'Tutulan ve doğru',
    'rounds.pct': 'Doğru',
    'method.h': 'Nasıl ölçüldü, neyi göstermiyor',
    method: [
      'Canlı ajan (Tavily, Nebius Token Factory üzerinde Nemotron, canlı kontroller), Türkiye’deki bir web hizmeti satış listesinden alınan 12’şer gerçek işletmede çalıştı: e-ticaret, klinik, otel, kafe; çoğu yalnız adıyla yazıldı.',
      'Tutulan her iddia Proofline dışında elle yeniden kontrol edildi (curl, openssl, sayfanın tamamı, harita, doğrudan aramalar) ve doğru ya da yanlış işaretlendi. Kontrolün karara bağlayamadığı iddia yüzdeye katılmaz, burada "belirsiz" olarak görünür.',
      'Her hata ya bir düzeltme ve onu koruyan bir test oldu ya da adı konmuş bir sınır. Her düzeltme sonra, kendisi için yapılmadığı bir listede ölçüldü.',
      'Göstermedikleri: listeleri ve kontrolleri ekip seçti ve yaptı; her tur bir kez çalıştı; haritada eski ya da başka bir adla kayıtlı işletme bilinen bir sınır.',
    ],
    foot: 'Nebius × NVIDIA Global AI Hackathon için yapıldı',
    'foot.src': 'Ayrıntılı yazı GitHub’da',
  },
};

const tx = (k, vars) => {
  const s = TEXT[getLang()]?.[k] ?? TEXT.en[k] ?? k;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (m, v) => (vars && vars[v] != null ? String(vars[v]) : m)) : s;
};
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const $ = (s) => document.querySelector(s);

function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}

let view = 'all';

function renderStats() {
  const H = PROOF.headline;
  const G = PROOF.gate;
  const R = PROOF.reports.lastFresh;
  const stat = (big, small, label, tone) => h('div', { class: `proof-stat ${tone}` },
    h('p', { class: 'proof-stat-big' }, big, h('span', { class: 'proof-stat-small' }, ` ${small}`)),
    h('p', { class: 'proof-stat-label' }, label));
  $('#stats').replaceChildren(
    stat(getLang() === 'tr' ? `%${num(pct(H.kept, H.total))}` : `${num(pct(H.kept, H.total))}%`, tx('stat.accOf', { a: num(H.kept), b: num(H.total) }), tx('stat.acc'), 'good'),
    stat(num(G.wrong), tx('stat.gateOf', { a: num(G.noGateWrong) }), tx('stat.gate'), 'gate'),
    stat(num(R.withGate), tx('stat.reportsOf', { b: num(R.reports), c: num(R.withoutGate) }), tx('stat.reports'), 'gate'));
}

function renderFinal() {
  const F = PROOF.frozen;
  const r = F.result;
  $('#final').replaceChildren(
    h('p', { class: 'proof-note' }, r ? tx('final.done', { day: r.day, a: num(r.right), b: num(r.checkable), pct: num(pct(r.right, r.checkable)) }) : tx('final.wait')),
    r ? h('p', { class: 'proof-note' }, tx('final.more', { w: num(r.wrong), u: num(r.unsettled), d: num(r.dropped), n: num(r.businesses) })) : null,
    h('p', { class: 'proof-final-links' },
      h('a', { href: F.file }, tx('final.list')), ' · ',
      r ? [h('a', { href: r.run }, tx('final.run')), ' · ', h('a', { href: r.verdicts }, tx('final.verdicts')), ' · '] : null,
      h('a', { href: F.note }, tx('final.why')), ' · ',
      h('span', { class: 'proof-hash' }, `${tx('final.hash')} ${F.sha256.slice(0, 12)}…`)));
}

function renderFilter() {
  const b = (key) => h('button', { type: 'button', 'aria-pressed': String(view === key), 'data-view': key }, tx(`filter.${key}`));
  $('#filter').setAttribute('aria-label', tx('filter.label'));
  $('#filter').replaceChildren(b('all'), b('wrong'), b('dropped'));
}

// The hand check's note without its leading mark ("right (ends 1 Jan 2027)" -> "ends 1 Jan 2027"); the badge says it.
const noteText = (s) => String(s || '').replace(/^(right|wrong|unverifiable)\b[:\s]*/i, '').replace(/^\((.*)\)$/s, '$1').trim();

function claimRow(c, lang) {
  const text = claimStatement(c, c.ctx, lang);
  const n = noteText(c.note);
  const note = h('p', { class: 'proof-claim-note' }, lang === 'tr' && tx('noteLang') ? h('span', { class: 'sr-only' }, `${tx('noteLang')}: `) : null, h('span', { lang: 'en' }, n));
  return h('li', { class: `proof-claim ${c.mark}` },
    h('span', { class: 'proof-mark' }, tx(`mark.${c.mark}`)),
    h('div', { class: 'proof-claim-body' }, h('p', { class: 'proof-claim-text' }, text), n ? note : null));
}

function droppedRow(c, lang) {
  return h('li', { class: `proof-claim dropped ${c.truth}` },
    h('span', { class: 'proof-mark' }, tx('mark.dropped')),
    h('div', { class: 'proof-claim-body' },
      h('p', { class: 'proof-claim-text' }, h('s', {}, claimStatement(c, c.ctx, lang) || c.type), ' ', h('span', { class: 'proof-drop-why' }, `(${tx(`drop.${c.truth}`)})`)),
      h('p', { class: 'proof-claim-note' }, h('span', { lang: 'en' }, c.note))));
}

function renderClaims() {
  const lang = getLang();
  const rounds = PROOF.lists.map((l) => {
    const all = l.businesses.flatMap((b) => b.kept);
    const checkable = all.filter((c) => c.mark !== 'unsettled');
    const businesses = l.businesses.map((b) => {
      const kept = view === 'dropped' ? [] : b.kept.filter((c) => view === 'all' || c.mark !== 'right');
      const dropped = view === 'wrong' ? [] : b.dropped;
      if (!kept.length && !dropped.length) return null;
      return h('article', { class: 'proof-biz' },
        h('h4', {}, h('span', { class: 'muted' }, `${tx('typed')} `), h('span', { lang: 'tr' }, b.query)),
        h('ul', { class: 'proof-claims' }, kept.map((c) => claimRow(c, lang)), dropped.map((c) => droppedRow(c, lang))));
    }).filter(Boolean);
    if (!businesses.length) return null;
    return h('section', { class: 'proof-round' },
      h('h3', {}, tx('round.h', { n: l.round }), h('span', { class: 'proof-round-sum' },
        ` · ${tx('round.sum', { a: num(checkable.filter((c) => c.mark === 'right').length), b: num(checkable.length) })} · `,
        h('a', { href: l.verdicts }, tx('round.file')))),
      businesses);
  }).filter(Boolean);
  $('#claims').replaceChildren(...(rounds.length ? rounds : [h('p', { class: 'proof-note' }, tx('empty'))]));
}

function renderSearch() {
  const rows = PROOF.search.map((r) => h('tr', {},
    h('td', { lang: 'en' }, r.run.replace(/`/g, '')),
    h('td', {}, r.checkable ? `${num(r.right)} / ${num(r.checkable)}` : tx('search.none')),
    h('td', {}, `${num(r.sitesFound)} / ${num(r.sites)}`)));
  $('#search').replaceChildren(
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, tx('search.run')), h('th', { scope: 'col' }, tx('search.kept')), h('th', { scope: 'col' }, tx('search.sites')))),
    h('tbody', {}, rows));
}

function renderRounds() {
  const head = ['round', 'list', 'proposed', 'dropped', 'right', 'pct'].map((k) => h('th', { scope: 'col' }, tx(`rounds.${k}`)));
  const rows = PROOF.rounds.map((r) => h('tr', { class: r.fresh ? 'fresh' : null },
    h('td', {}, num(r.round)),
    h('td', {}, tx(r.fresh ? 'rounds.fresh' : 'rounds.repeat')),
    h('td', {}, num(r.proposed)),
    h('td', {}, num(r.dropped)),
    h('td', {}, `${num(r.right)} / ${num(r.checkable)}`),
    h('td', {}, getLang() === 'tr' ? `%${num(pct(r.right, r.checkable))}` : `${num(pct(r.right, r.checkable))}%`)));
  $('#rounds').replaceChildren(h('thead', {}, h('tr', {}, head)), h('tbody', {}, rows));
}

function renderStatic() {
  document.title = tx('title');
  document.querySelectorAll('[data-p]').forEach((n) => { n.textContent = tx(n.dataset.p); });
  $('#method').replaceChildren(...tx('method').map((s) => h('li', {}, s)));
  document.querySelectorAll('.lang [data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}

function renderAll() {
  renderStatic();
  renderStats();
  renderFinal();
  renderFilter();
  renderClaims();
  renderSearch();
  renderRounds();
}

$('#filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  view = b.dataset.view;
  renderFilter();
  renderClaims();
});
document.querySelectorAll('.lang [data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang, { persist: true })));
onLangChange(renderAll);
setLang(detectLang());
renderAll();
