// Report wording in the page's language.
//
// The server writes claim sentences, check names, check results and drop reasons in English: they are
// fixed sentences built by code, the same in every run. Here they are shown in Turkish when the page is
// in Turkish. Anything not recognised is shown as sent (an untranslated sentence beats a wrong one).
// The words the models write (owner lines, summary, pitch) come from the server already in the run's
// language (see /api/run?lang=).

// Claim sentences. Each value used must appear in the English sentence, so the Turkish one says the same.
const STATEMENT_TR = {
  site_online: ({ domain }) => `${domain} açılıyor ve gerçek içerik gösteriyor.`,
  site_unreachable: ({ domain }) => `${domain} açılmıyor (iki deneme de başarısız).`,
  domain_parked: ({ domain }) => `${domain} işletme yerine park edilmiş, satılık ya da boş bir sayfa gösteriyor.`,
  https_healthy: ({ domain }) => `${domain} için sertifika en az 30 gün geçerli ve ziyaretçiler HTTPS'e yönlendiriliyor.`,
  ssl_expiring_soon: ({ domain }) => `${domain} adresinin güvenlik sertifikası 30 gün içinde bitiyor.`,
  ssl_invalid: ({ domain }) => `${domain} adresinin güvenlik sertifikası süresi dolmuş ya da geçersiz; tarayıcılar uyarı gösteriyor.`,
  no_https_redirect: ({ domain }) => `${domain} adresini https olmadan yazanlar güvensiz bağlantıda kalıyor.`,
  no_contact_path: () => 'Ana sayfada iletişim formu, e-posta bağlantısı, tıkla-ara ya da WhatsApp bağlantısı yok.',
  phone_confirmed: ({ phone }) => `${phone} işletmenin kendi numarası: kendi web sitesinde yazıyor.`,
  phone_unconfirmed: ({ phone }) => `${phone} (listelemelerden) işletmenin kendi sitesinde yok; eski olabilir.`,
  no_own_website: ({ name }) => `${name} için kendi web sitesi bulunamadı; yalnızca listeleme ve platformlarda görünüyor.`,
  on_map: ({ name }) => `${name} OpenStreetMap'te kayıtlı.`,
  not_on_map: ({ name }) => `${name}, birçok harita uygulamasının kullandığı OpenStreetMap'te yok.`,
  possibly_closed: ({ name }) => `Herkese açık bir sayfa ${name} işletmesinin kapanmış olabileceğini söylüyor. Ulaşmadan önce teyit edin.`,
  possibly_renamed: ({ domain, name }) => `${domain} adresindeki site “${name}” yerine başka bir ad kullanıyor; işletmenin adı ya da sahibi değişmiş olabilir.`,
};
const STATEMENT_USES = {
  site_online: ['domain'], site_unreachable: ['domain'], domain_parked: ['domain'], https_healthy: ['domain'],
  ssl_expiring_soon: ['domain'], ssl_invalid: ['domain'], no_https_redirect: ['domain'], no_contact_path: [],
  phone_confirmed: ['phone'], phone_unconfirmed: ['phone'], no_own_website: ['name'], on_map: ['name'],
  not_on_map: ['name'], possibly_closed: ['name'], possibly_renamed: ['domain', 'name'],
};

const CHECK_TR = {
  'site.own_site': 'Alan adı işletmenin kendi web sitesi',
  'web.own_site_found': 'Arama sonuçları kendi web sitesine çıkıyor',
  'site.turkish_alternative': 'Yalnız ad yazıldığında Türkçe site, Türkçe olmayan siteye tercih ediliyor',
  'dns.resolves': "Alan adı DNS'te çözülüyor",
  'http.reachable': 'Web sitesi HTTPS üzerinden yanıt veriyor',
  'http.https_redirect': "Düz HTTP, HTTPS'e yönleniyor",
  'tls.cert_valid': 'TLS sertifikası geçerli',
  'page.not_parked': 'Ana sayfa gerçek bir site, park edilmiş ya da boş sayfa değil',
  'page.contact_path': 'Ziyaretçiler siteden iletişime geçebiliyor',
  'page.phone_listed': 'Telefon numarası resmî sitede yazıyor',
  'page.name_match': 'Site adı işletme adıyla eşleşiyor',
  'osm.listed': "Bu adla OpenStreetMap'te kayıtlı",
  'web.no_closure_signal': 'İşletmenin kapandığına dair herkese açık bir işaret yok',
};

// Listing platform kinds (src/platforms.mjs labels).
const PLATFORM_TR = {
  'menu / QR-menu provider': 'menü / QR menü sağlayıcısı',
  'food delivery / ordering': 'yemek siparişi / teslimat',
  'review / directory': 'yorum / rehber sitesi',
  'booking / travel': 'rezervasyon / seyahat',
  'marketplace / services': 'pazar yeri / hizmet platformu',
  'social network / link hub': 'sosyal ağ / bağlantı sayfası',
  maps: 'harita',
  'maps / search': 'harita / arama',
};
const platformTr = (label) => PLATFORM_TR[label] || label;

const HOW_TR = {
  'its homepage is a search result that names the business': 'ana sayfası, işletmeyi adıyla anan bir arama sonucu',
  'a search result about the business names this domain': 'işletmeyle ilgili bir arama sonucu bu alan adını anıyor',
};
const none = (s) => (s === 'none' ? 'yok' : s);
// the ways to get in touch that page.contact_path names ("Found: contact form, phone number")
const CONTACT_WAYS = {
  'contact form': 'iletişim formu', 'email link': 'e-posta bağlantısı', 'tap-to-call link': 'dokun-ara bağlantısı',
  'WhatsApp link': 'WhatsApp bağlantısı', 'email address': 'e-posta adresi', 'phone number': 'telefon numarası',
};

// Check results, most specific first. A function gets the match and the translator (for nested results).
const SUMMARY_TR = [
  [/^Not checked: the homepage is longer than the part we read/, () => 'Kontrol edilmedi: ana sayfa okuduğumuz kısımdan uzun, “bulunamadı” demek tahmin olurdu'],
  [/^Own website found: (.+?)( \(found by trying the address built from the name\))?$/, (m, tr) => `Kendi web sitesi bulundu: ${tr(m[1])}${m[2] ? ' (addan türetilen adres denenerek bulundu)' : ''}`],
  [/^Not settled: (.+)$/, (m, tr) => `Kesinleşmedi: ${tr(m[1])}`],
  [/^Not checked: (.+)$/, (m) => `Kontrol edilmedi: ${m[1]}`],
  [/^skipped: (.+) is not the business's own website$/, (m) => `atlandı: ${m[1]} işletmenin kendi sitesi değil`],
  [/^Loaded with HTTP (\d{3})(?: \(ended at (.+)\))?$/, (m) => `HTTP ${m[1]} ile açıldı${m[2] ? ` (${m[2]} adresinde bitti)` : ''}`],
  [/^Failed twice: (.+)$/, (m) => `İki deneme de başarısız: ${m[1]}`],
  [/^(\S+) has (\d+) address record\(s\)$/, (m) => `${m[1]} için ${m[2]} adres kaydı var`],
  [/^(\S+) has no address records$/, (m) => `${m[1]} için adres kaydı yok`],
  [/^DNS lookup failed: (.+)$/, (m) => `DNS sorgusu başarısız: ${m[1]}`],
  [/^http:\/\/ redirects to (.+)$/, (m) => `http:// adresi ${m[1]} adresine yönleniyor`],
  [/^http:\/\/ stays on plain HTTP \((.+)\)$/, (m) => `http:// düz HTTP'de kalıyor (${m[1] === 'no redirect' ? 'yönlendirme yok' : m[1]})`],
  [/^http:\/\/ did not answer: (.+)$/, (m) => `http:// yanıt vermedi: ${m[1]}`],
  [/^Certificate expires in (-?\d+) day\(s\)(?: \(needs ≥ (\d+)\))?$/, (m) => `Sertifika ${m[1]} gün sonra bitiyor${m[2] ? ` (en az ${m[2]} gerekir)` : ''}`],
  [/^Certificate expired (\d+) day\(s\) ago(?: \(needs ≥ (\d+)\))?$/, (m) => `Sertifikanın süresi ${m[1]} gün önce doldu${m[2] ? ` (en az ${m[2]} gerekir)` : ''}`],
  [/^Certificate is not trusted(?:: (.+))?$/, (m) => `Sertifikaya güvenilmiyor${m[1] ? `: ${m[1]}` : ''}`],
  [/^Certificate expiry date not available$/, () => 'Sertifikanın bitiş tarihi alınamadı'],
  [/^TLS handshake failed: (.+)$/, (m) => `TLS bağlantısı kurulamadı: ${m[1]}`],
  [/^Parked\/placeholder marker found: “(.*)”$/, (m) => `Park/boş sayfa işareti bulundu: “${m[1]}”`],
  [/^Real content \(title: “(.*)”\)$/, (m) => `Gerçek içerik (başlık: “${none(m[1])}”)`],
  [/^Page did not load$/, () => 'Sayfa açılmadı'],
  [/^Found: (.+)$/, (m) => `Bulundu: ${m[1].split(', ').map((w) => CONTACT_WAYS[w] || w).join(', ')}`],
  [/^No form, email, phone or WhatsApp contact on the homepage$/, () => 'Ana sayfada form, e-posta, telefon ya da WhatsApp iletişimi yok'],
  [/^No phone number to look for$/, () => 'Aranacak telefon numarası yok'],
  [/^(.+) is listed on the site$/, (m) => `${m[1]} sitede yazıyor`],
  [/^(.+) is not on the site \(site lists: (.*)\)$/, (m) => `${m[1]} sitede yok (sitedeki numaralar: ${none(m[2])})`],
  [/^The site names “(.+)” \(([\w:-]+): “(.*)”\)$/, (m) => `Site “${m[1]}” adını taşıyor (${m[2]}: “${m[3]}”)`],
  [/^“(.*)” vs “(.+)”: similarity ([\d.]+) \(needs ≥ ([\d.]+)\), name not found on the page$/, (m) => `“${m[1] === 'untitled' ? 'başlıksız' : m[1]}” ile “${m[2]}”: benzerlik ${m[3]} (en az ${m[4]} gerekir), ad sayfada bulunamadı`],
  [/^Found “(.+)” \((.+)\)$/, (m) => `“${m[1]}” bulundu (${m[2]})`],
  [/^No matching place on OpenStreetMap$/, () => "OpenStreetMap'te eşleşen yer yok"],
  [/^Map lookup failed: (.+)$/, (m) => `Harita araması başarısız: ${m[1]}`],
  [/^Closure signal: “(.+)” on (.+)$/, (m) => `Kapanma işareti: “${m[1]}” (${m[2]})`],
  [/^No closure signal in (\d+) search result\(s\)$/, (m) => `${m[1]} arama sonucunda kapanma işareti yok`],
  [/^Search failed: (.+)$/, (m) => `Arama başarısız: ${m[1]}`],
  [/^Search returned nothing; cannot say whether a website exists$/, () => 'Arama sonuç vermedi; web sitesi olup olmadığı söylenemez'],
  [/^No business name to (?:check the site against|search for)$/, () => 'Karşılaştırılacak işletme adı yok'],
  [/^No website of its own among (\d+) search result\(s\)(?:; listings only: ([^;]+))?(?:; (.+) did not load and nothing ties it to the business)?$/,
    (m) => `${m[1]} arama sonucunda kendi web sitesi yok${m[2] ? `; yalnızca listelemeler: ${m[2]}` : ''}${m[3] ? `; ${m[3]} açılmadı ve onu işletmeye bağlayan bir şey yok` : ''}`],
  [/^(\S+) is a listing platform \((.+)\), not the business's own website$/, (m) => `${m[1]} bir listeleme platformu (${platformTr(m[2])}), işletmenin kendi sitesi değil`],
  [/^(\S+) is a site-builder address that does not name the business, so it is not treated as its own website$/, (m) => `${m[1]} işletmenin adını taşımayan bir site kurucu adresi; kendi sitesi sayılmadı`],
  [/^(\S+) was given by the user as the business's website$/, (m) => `${m[1]}, kullanıcı tarafından işletmenin sitesi olarak verildi`],
  [/^(\S+) names the business \(([\w:-]+): “(.*)”\)$/, (m) => `${m[1]} işletmenin adını taşıyor (${m[2]}: “${m[3]}”)`],
  [/^(\S+) is tied to “(.+)”: (.+) \((\S+)\)$/, (m) => (HOW_TR[m[3]] ? `${m[1]}, “${m[2]}” ile bağlantılı: ${HOW_TR[m[3]]} (${m[4]})` : null)],
  [/^(\S+) uses the name “(.+)” but nothing on it or in search ties it to (.+); it may be a namesake$/, (m) => `${m[1]} “${m[2]}” adını kullanıyor ama ne sitede ne aramada ${m[3]} ile bağı var; adaş olabilir`],
  [/^No search result ties (\S+) to “(.+)”; a different name on an unverified site is not evidence of a rename$/, (m) => `Hiçbir arama sonucu ${m[1]} adresini “${m[2]}” ile bağlamıyor; doğrulanmamış bir sitede farklı ad, ad değişikliği kanıtı değildir`],
  [/^(\S+) does not identify “(.+)” \(page says “(.*)”\) and no search result ties it to the business$/, (m) => `${m[1]} “${m[2]}” adını taşımıyor (sayfada “${m[3] === 'untitled' ? 'başlıksız' : m[3]}” yazıyor) ve hiçbir arama sonucu onu işletmeye bağlamıyor`],
  [/^(\S+) does not load and never appeared as a web address in the search results — no own website found$/, (m) => `${m[1]} açılmıyor ve arama sonuçlarında hiç web adresi olarak geçmedi; kendi web sitesi bulunamadı`],
  [/^(\S+) did not load and no search result ties it to “(.+)”$/, (m) => `${m[1]} açılmadı ve hiçbir arama sonucu onu “${m[2]}” ile bağlamıyor`],
  [/^(\S+) not checked: (.+)$/, (m) => `${m[1]} kontrol edilmedi: ${m[2]}`],
  [/^Check crashed: (.+)$/, (m) => `Kontrol çöktü: ${m[1]}`],
];

/** A check result (evidence summary) in the given language; unknown sentences as sent. */
export function summaryText(summary, lang) {
  const s = String(summary ?? '');
  if (lang !== 'tr') return s;
  for (const [re, fn] of SUMMARY_TR) {
    const m = re.exec(s);
    if (!m) continue;
    const out = fn(m, (x) => summaryText(x, lang));
    if (out) return out;
  }
  return s;
}

/** A check's name in the given language. */
export function checkTitle(e, lang) {
  return (lang === 'tr' && CHECK_TR[e?.check]) || e?.title || e?.check || '';
}

/**
 * A claim sentence in the given language. ctx gives the values (domain, phone, name); the Turkish
 * sentence is used only if each value it needs is present in the English one, else the English stays.
 */
export function claimStatement(c, ctx, lang) {
  const type = c?.claimType || c?.type; // trace events carry claimType (their type is 'gate')
  const en = String(c?.statement ?? '');
  if (lang !== 'tr' || !STATEMENT_TR[type]) return en;
  const v = { domain: ctx?.domain, phone: ctx?.phone, name: ctx?.name };
  if (!STATEMENT_USES[type].every((k) => v[k] && en.includes(v[k]))) return en;
  return STATEMENT_TR[type](v);
}

/** Why the gate dropped a claim, in the given language, rebuilt from its evidence. */
export function dropReasonText(c, lang) {
  if (lang !== 'tr' || !Array.isArray(c?.evidence)) return c?.dropReason || '';
  const failed = c.evidence.filter((e) => !e.matched && !e.skipped);
  if (!failed.length) return c.dropReason || '';
  return failed.map((e) => {
    const title = checkTitle(e, lang);
    const summary = summaryText(e.summary, lang);
    if (e.pass === null || e.pass === undefined) return `${title}: sonuç alınamadı (${summary})`;
    return `${title}: ${e.expect ? 'geçmesi' : 'kalması'} gerekiyordu, ${e.pass ? 'geçti' : 'kaldı'} — ${summary}`;
  }).join('; ');
}

const REASON_TR = [
  [/^cites a claim that did not pass the gate$/, () => 'kapıdan geçmeyen bir iddiaya dayanıyor'],
  [/^no citation$/, () => 'kaynak göstermiyor'],
  [/^introduced a number not in the evidence \((.+)\)$/, (m) => `kanıtta olmayan bir sayı ekledi (${m[1]})`],
];

/** Why a model sentence was removed (pitch lint, owner rewrite), in the given language. */
export function removedReasonText(reason, lang) {
  const s = String(reason ?? '');
  if (lang !== 'tr') return s;
  for (const [re, fn] of REASON_TR) {
    const m = re.exec(s);
    if (m) return fn(m);
  }
  return s;
}

// What the planner's guards removed or set aside (see pipeline.mjs, step 3).
const GUARD_TR = [
  [/^(.+) — website checks skipped$/, (m) => `${summaryText(m[1], 'tr')} — site kontrolleri atlandı`],
  [/^(\S+) never appeared as a web address in the input or search results \(only the model named it\) — not used as the website$/, (m) => `${m[1]} girdide ya da arama sonuçlarında hiç web adresi olarak geçmedi (yalnızca model söyledi) — web sitesi olarak kullanılmadı`],
  [/^phone (.+) not seen in search results$/, (m) => `${m[1]} telefonu arama sonuçlarında görülmedi`],
  [/^the model named a different business \(“(.+)”\) than the one asked for \(“(.+)”\) — its name, city, domain and phone are not used$/, (m) => `model sorulandan (“${m[2]}”) farklı bir işletme (“${m[1]}”) söyledi — adı, şehri, alan adı ve telefonu kullanılmadı`],
  [/^using (\S+) instead: (.+)$/, (m) => `bunun yerine ${m[1]} kullanıldı: ${summaryText(m[2], 'tr')}`],
];
function guardText(g) {
  return guardNoteText(g, 'tr');
}
/** A planner guard note (trace and model panel) in the given language; unknown notes as sent. */
export function guardNoteText(g, lang) {
  if (lang !== 'tr') return String(g ?? '');
  for (const [re, fn] of GUARD_TR) {
    const m = re.exec(g);
    if (m) return fn(m);
  }
  return g;
}

// Model call results (the "model calls" panel): " · "-separated parts, each translated on its own.
const DETAIL_TR = [
  [/^(\d+) proposed$/, (m) => `${m[1]} önerildi`],
  [/^(\d+) kept by the gate$/, (m) => `${m[1]} kapıdan geçti`],
  [/^(\d+) dropped by the gate$/, (m) => `${m[1]} kapıda elendi`],
  [/^(\d+) outside the catalog$/, (m) => `${m[1]} katalog dışı`],
  [/^(\d+) rewrite\(s\) accepted$/, (m) => `${m[1]} yeniden yazım kabul edildi`],
  [/^(\d+) rejected: (.+)$/, (m) => `${m[1]} reddedildi: ${m[2].split('; ').map((x) => x.replace(/^(\S+) (.+)$/, (_, id, why) => `${id} ${removedReasonText(why, 'tr')}`)).join('; ')}`],
  [/^(\d+) cited finding\(s\) kept$/, (m) => `${m[1]} kaynaklı bulgu tutuldu`],
  [/^(\d+) sentence\(s\) removed by citation lint$/, (m) => `${m[1]} kaynaksız cümle çıkarıldı`],
  [/^own-site guard: (.+)$/, (m) => `kendi site denetimi: ${m[1].split('; ').map(guardText).join('; ')}`],
  [/^guard removed: (.+)$/, (m) => `denetim çıkardı: ${m[1].split('; ').map(guardText).join('; ')}`],
  [/^no domain or phone picked$/, () => 'alan adı ya da telefon seçilmedi'],
  [/^domain (\S+)$/, (m) => `alan adı ${m[1]}`],
  [/^phone (.+)$/, (m) => `telefon ${m[1]}`],
];

/** A model call's result line in the given language; unknown parts as sent. */
export function modelDetailText(detail, lang) {
  const s = String(detail ?? '');
  if (lang !== 'tr') return s;
  return s.split(' · ').map((part) => {
    for (const [re, fn] of DETAIL_TR) {
      const m = re.exec(part);
      if (m) return fn(m);
    }
    return part;
  }).join(' · ');
}

// The recorded examples' rule-based stand-in, named in the trace and the model calls panel.
const SAMPLE_MODEL = 'sample (rule-based)';
/** A model name for display: real model ids as sent; the stand-in in the page's language. */
export function modelName(model, lang) {
  return lang === 'tr' && model === SAMPLE_MODEL ? 'örnek (kurallara dayalı)' : String(model ?? '');
}

/**
 * The facts under the business name on the health card. A domain that the checks showed is not the
 * business's own website (a listing or menu platform) is not shown as its address.
 */
export function cardFacts(ctx) {
  return [ctx?.ownSite === false ? null : ctx?.domain, ctx?.city, ctx?.phone].filter(Boolean);
}
