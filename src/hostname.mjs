// Is this string a real web address? Offline, dependency-free.
//
// A website candidate must be a syntactically valid hostname whose ending is a real public
// suffix. That rules out text fragments that only look like domains: an address abbreviation
// ("A.Ayrancı" -> "a.ayranc"), an @handle, an email, a file name ("menu.pdf") or an IP address.
//
// Maintenance: plain data. This is a compact list, not the full Public Suffix List: the generic
// TLDs commonly seen on small-business sites plus every two-letter country code, and the common
// second-level registries (com.tr, co.uk ...). Add a suffix here if a real site is rejected.

const GENERIC = `com net org info biz name pro mobi asia tel travel jobs aero coop museum edu gov mil int
  app dev io ai co me tv cc ly gg fm am to ws la so sh is
  shop store online site website web tech blog cafe coffee restaurant bar pub pizza kitchen menu food
  club studio design art photo photography gallery media news live life world global city
  center centre agency company business services solutions consulting digital marketing network
  systems software email link click page space zone one top xyz icu fun vip win
  group team family love fit fitness yoga beauty hair salon spa dental clinic health care doctor
  hotel holiday travel tours rentals house homes estate realty properties land build
  legal law lawyer attorney finance money fund capital tax insurance bank academy school education
  istanbul ist berlin london paris nyc tokyo amsterdam
  wiki events market shopping fashion clothing boutique jewelry wine beer bio eco green farm garden
  auto car cars taxi bike games game music band dance social chat today guru ninja rocks cloud host
  express delivery direct support help tips guide review reviews`;

// Every ISO 3166-1 alpha-2 country-code TLD that is delegated (plus eu, uk, su, ac).
const CC = `ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw
  by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi
  fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io
  iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg
  mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph
  pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy
  sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt
  za zm zw`;

// Reserved names (RFC 2606 / 6761): never resolve publicly, used by the sample mode and the tests.
const RESERVED = 'example test';

// Second-level registries: "x.com.tr" is a site, bare "com.tr" is not.
const SECOND_LEVEL = `com.tr net.tr org.tr gen.tr web.tr biz.tr info.tr av.tr bel.tr k12.tr edu.tr gov.tr
  tv.tr bbs.tr name.tr tel.tr dr.tr pol.tr tsk.tr kep.tr
  co.uk org.uk me.uk ltd.uk plc.uk net.uk ac.uk gov.uk nhs.uk sch.uk
  com.au net.au org.au edu.au gov.au id.au asn.au
  co.nz net.nz org.nz govt.nz ac.nz
  co.za org.za net.za gov.za ac.za
  co.jp ne.jp or.jp ac.jp go.jp
  co.kr or.kr ne.kr
  com.br net.br org.br gov.br
  com.ar com.mx com.co com.pe com.ve com.uy com.ec com.bo com.py
  com.cn net.cn org.cn com.hk com.tw com.sg com.my com.ph com.vn com.pk com.bd com.np com.lk
  co.in net.in org.in firm.in gen.in ind.in
  co.id or.id web.id
  co.il org.il
  com.eg com.sa com.qa com.kw com.om com.bh com.lb com.jo com.ly com.cy com.mt com.gr
  co.ke co.tz co.ug com.ng com.gh
  com.ua org.ua kiev.ua com.ru org.ru com.pl net.pl org.pl com.ro com.es org.es nom.es com.pt
  co.at or.at co.th in.th ac.th`;

const words = (s) => s.split(/\s+/).filter(Boolean);
export const TLDS = new Set([...words(GENERIC), ...words(CC), ...words(RESERVED)]);
export const SECOND_LEVEL_SUFFIXES = new Set(words(SECOND_LEVEL));

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * Check a raw string. Accepts a bare host or a URL ("https://www.x.com.tr/menu").
 *   { ok: true, host, suffix }
 *   { ok: false, host, reason }   reason is a short noun phrase ("unknown ending .ayranc")
 */
export function checkHostname(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { ok: false, host: '', reason: 'empty' };
  if (/\s/.test(s)) return { ok: false, host: s, reason: 'contains spaces' };
  if (s.startsWith('@')) return { ok: false, host: s, reason: 'a social media handle' };
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  if (s.includes('@')) return { ok: false, host: s, reason: 'an email address or handle' };
  s = s.replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s) || s.includes(':') || s.startsWith('[')) {
    return { ok: false, host: s, reason: 'an IP address' };
  }
  if (s.length > 253) return { ok: false, host: s, reason: 'too long' };
  const labels = s.split('.');
  if (labels.length < 2) return { ok: false, host: s, reason: 'no domain ending' };
  if (!labels.every((l) => LABEL.test(l))) return { ok: false, host: s, reason: 'characters a web address cannot have' };
  const last2 = labels.slice(-2).join('.');
  if (SECOND_LEVEL_SUFFIXES.has(last2)) {
    return labels.length >= 3
      ? { ok: true, host: s, suffix: last2 }
      : { ok: false, host: s, reason: `only the ending .${last2}` };
  }
  const tld = labels[labels.length - 1];
  if (!TLDS.has(tld)) return { ok: false, host: s, reason: `unknown ending .${tld}` };
  return { ok: true, host: s, suffix: tld };
}

export function isValidHostname(raw) {
  return checkHostname(raw).ok;
}

/** "a.ayranc is not a valid web address (unknown ending .ayranc)", or null when it is valid. */
export function invalidHostSentence(raw) {
  const c = checkHostname(raw);
  return c.ok ? null : `${c.host || String(raw)} is not a valid web address (${c.reason})`;
}
