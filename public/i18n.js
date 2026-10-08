// Interface language: English and Turkish. A flat dictionary per language, no dependencies, no DOM
// at import time (gate-data.js and gate.js import it and are tested in Node).
//
// Language choice, first match wins: ?lang=tr|en in the address, the visitor's saved choice
// (localStorage), the browser language (tr* -> Turkish), otherwise English.
// Plurals: a key with "_one"/"_other" variants is picked with Intl.PluralRules on vars.n.
// What the agent writes (claims, findings, summary, drop reasons) is report data and stays as written.

export const LANGS = ['en', 'tr'];
export const LOCALE = { en: 'en-US', tr: 'tr-TR' };
const STORE_KEY = 'proofline.lang';

export const DICT = {
  en: {
    'doc.title': 'Proofline — every claim comes with its proof',
    'lang.label': 'Language',
    'lang.en': 'English',
    'lang.tr': 'Türkçe',
    'skip': 'Skip to the search box',
    'brand.home': 'Proofline home',

    'shared.eyebrow': 'Shared Proofline report',
    'shared.loading': 'Loading…',
    'shared.cta': 'Run your own check',
    'shared.unavailable': 'Link not available',
    'shared.sample': 'Recorded example (fictional business)',
    'shared.live': 'Live search',
    'shared.when': '{kind} · generated {when}',
    'shared.pill': 'Shared report · read-only',
    'shared.loadingReport': 'Loading the shared report…',
    'shared.loadFailed': 'Could not load the report. Check your connection and reload the page.',

    'hero.eyebrow': 'Business profile agent',
    'hero.title': 'Every claim comes with its proof.',
    'hero.lede': 'Give it a small business. Proofline gathers its scattered web traces, lets NVIDIA Nemotron propose what is true, then re-checks every claim itself. Anything it cannot prove is dropped, in plain sight.',
    'ask.label': 'Business name and city, or a domain',
    'ask.placeholder': 'Name, city — or a domain',
    'ask.placeholderSample': 'Pick an example below',
    'ask.go': 'Check it',
    'ask.busy': 'Checking…',
    'modes.legend': 'Mode',
    'modes.sample': 'Recorded examples',
    'modes.sampleNote': 'instant · free',
    'modes.live': 'Live search',
    'modes.liveNote': 'Nemotron + Tavily',
    'modes.left_one': '{n} left today · Nemotron + Tavily',
    'modes.left_other': '{n} left today · Nemotron + Tavily',
    'modes.quotaUsed': 'quota used up today',
    'modes.notConfigured': 'not configured yet',
    'note.sample': 'Recorded mode replays four fictional businesses, each with a planted wrong claim for the gate to catch. Pick one below.',
    'note.notConfigured': 'Live mode is not configured on this demo yet — try a recorded example.',
    'note.live': 'Live search calls NVIDIA Nemotron on Nebius Token Factory and Tavily for real. To protect a small trial credit: {perVisitor} checks per visitor and {perDay} in total per day; the same query within {hours} h is answered from cache.',
    'samples.label': 'Examples',
    'samples.note': 'Recorded examples (fictional businesses):',
    'stage.caption': 'The proof gate, with claims from the examples: proven ones turn green, the rest are dropped.',
    'stage.pause': 'Pause',
    'stage.play': 'Play',
    'stage.aria': 'Animation: claim cards pass through three proof gates. Four proven claims are pinned as verified; three without proof turn grey and are dropped.',

    'mode.offline': 'offline',
    'mode.demoLive': 'Public demo · recorded + limited live search',
    'mode.demo': 'Public demo · recorded examples',
    'mode.sample': 'Sample mode · recorded data, no keys',
    'mode.live': 'Live · {model} on Nebius Token Factory',
    'mode.liveTavily': 'Live · {model} on Nebius Token Factory · Tavily',
    'offline.note': 'The demo server did not answer. Check your connection and reload the page.',

    'trace.title': 'Agent trace',
    'trace.events': 'Trace events',
    'stages.plan': 'Plan',
    'stages.observe': 'Tools',
    'stages.propose': 'Claims',
    'stages.gate': 'Gate',
    'stages.verify': 'Verify',
    'stages.write': 'Write',
    'working.plan': 'Searching the web and identifying the business…',
    'working.observe': 'Running the evidence checks…',
    'working.propose': 'Proposing claims from the evidence…',
    'working.gate': 'The gate is re-running every claim’s proof from scratch…',
    'working.verify': 'Rewriting verified claims for the owner…',
    'working.write': 'Writing the summary and a cited pitch…',
    'working.default': 'Working. The report appears once every claim has been through the gate.',

    'tag.kept': 'kept',
    'tag.dropped': 'dropped',
    'tag.cache': 'cache',
    'tag.start': 'start',
    'tag.intake': 'intake',
    'tag.tavily': 'tavily',
    'tag.plan': 'plan',
    'tag.model': 'model',
    'tag.check': 'check',
    'tag.claims': 'claims',
    'tag.verify': 'verify',
    'tag.write': 'write',

    'mark.pass': 'pass',
    'mark.fail': 'fail',
    'mark.na': 'not checked',

    'ev.allMatched_one': '{n} check re-run, all matched',
    'ev.allMatched_other': '{n} checks re-run, all matched',
    'ev.cacheTitle': 'Answered from cache',
    'ev.cacheMin': 'same query ran live {n} min ago · no new API calls · Re-run proof checks again now',
    'ev.cacheHours': 'same query ran live {n} h ago · no new API calls · Re-run proof checks again now',
    'ev.models': 'reasoning: {reasoning} · fast: {fast}',
    'ev.parsedDomain': 'Parsed as domain {domain}',
    'ev.parsedName': 'Parsed as “{name}”',
    'ev.parsedNameCity': 'Parsed as “{name}” in {city}',
    'ev.results_one': '{n} web result',
    'ev.results_other': '{n} web results',
    'ev.searchFailed': 'search failed: {error}',
    'ev.guard': 'guard: {text}',
    'ev.toClaims_one': '{n} claim to the gate',
    'ev.toClaims_other': '{n} claims to the gate',
    'ev.refused': '{n} outside the catalog, refused',
    'ev.noRewrite': 'No verified claims to rewrite',
    'ev.ownerLines_one': '{n} owner line',
    'ev.ownerLines_other': '{n} owner lines',
    'ev.rewritesRejected_one': '{n} rewrite rejected: {reasons}',
    'ev.rewritesRejected_other': '{n} rewrites rejected: {reasons}',
    'ev.pitchNone': 'Pitch not written',
    'ev.pitch_one': 'Pitch: {n} cited finding',
    'ev.pitch_other': 'Pitch: {n} cited findings',
    'ev.uncited_one': '{n} uncited sentence removed',
    'ev.uncited_other': '{n} uncited sentences removed',
    'ev.tokensNone': 'tokens not reported',
    'ev.tokens': '{in} in → {out} out tokens',
    'ev.tokensReasoning': '{in} in → {out} out tokens ({reasoning} reasoning)',

    'outcome.accepted': 'accepted',
    'outcome.partial': 'partly rejected',
    'outcome.rejected': 'rejected',
    'outcome.failed': 'no answer',
    'tier.reasoning': 'reasoning',
    'tier.fast': 'fast',
    'role.Planner': 'Planner',
    'role.Claim proposer': 'Claim proposer',
    'role.Owner rewrite': 'Owner rewrite',
    'role.Writer': 'Writer',

    'gate.title': 'The gate',
    'gate.sub': 'The model proposes claims; each claim’s checks are run again from scratch. Proven claims pass (green); the rest are dropped (grey) and never shown as findings.',
    'gate.skip': 'Skip animation',
    'gate.atGate_one': '{n} proposed claim at the gate',
    'gate.atGate_other': '{n} proposed claims at the gate',
    'gate.none': 'The model proposed no claim from the catalog, so nothing goes to the gate.',
    'gate.running': 'Re-running each claim’s proof from scratch. Proven claims pass; the rest stop at the line that failed them.',
    'gate.hint': 'Select a card to see its proof. Hover or focus a dropped one for the reason.',
    'gate.empty': 'No claim reached the gate in this run, so there was nothing to prove or drop.',
    'gate.tallyProposed': 'proposed',
    'gate.tallyVerified': 'verified',
    'gate.tallyDropped': 'dropped',
    'gate.identity': 'Identity',
    'gate.identity.short': 'Identity',
    'gate.web': 'Web · TLS',
    'gate.web.short': 'Web·TLS',
    'gate.reach': 'Contact · Map',
    'gate.reach.short': 'Contact',
    'gate.zoneQueue': 'Proposed',
    'gate.zoneKept': 'Verified',
    'gate.zoneDropped': 'Dropped · no proof',
    'gate.stamp': 'no proof',
    'gate.whyDropped': 'Why dropped',
    'gate.cardVerified': 'Verified: {statement}. Show its proof.',
    'gate.cardDropped': 'Dropped: {statement}. Show its proof.',
    'gate.cardDroppedWhy': 'Dropped: {statement}. Why dropped: {reason}. Show its proof.',
    'gate.notProven': 'not proven',

    'error.stopped': 'The run stopped before it finished (connection lost or the demo host’s time limit). Nothing was concluded from the checks that did not run.',
    'error.retry': 'Try again',
    'error.pickExample': 'Pick a recorded example',

    'models.title': 'Model calls',
    'models.sample': 'Recorded example: a rule-based stand-in plays the model, so no tokens are used. Live search runs the same steps on NVIDIA Nemotron via Nebius Token Factory.',
    'models.live': 'Every NVIDIA Nemotron call on Nebius Token Factory in this run, and what the code checks did with its answer.',
    'models.noTokens': 'Token counts were not recorded for this run.',
    'models.none': 'No model calls were recorded for this run.',
    'models.in': '{n} in',
    'models.out': '{n} out',
    'models.tokensDash': 'tokens —',
    'models.calls_one': '{n} model call',
    'models.calls_other': '{n} model calls',
    'models.standIn': 'rule-based stand-in, no tokens',
    'models.tokens': '{n} tokens',
    'models.droppedByGate_one': '{n} claim dropped by the gate',
    'models.droppedByGate_other': '{n} claims dropped by the gate',
    'models.rewritesRejected_one': '{n} rewrite rejected',
    'models.rewritesRejected_other': '{n} rewrites rejected',
    'legacy.guard': 'guard: {text}',
    'legacy.outside': '{n} outside the catalog',
    'legacy.removed': '{n} sentence(s) removed by citation lint',

    'grade.A': 'Strong',
    'grade.B': 'Good',
    'grade.C': 'Needs work',
    'grade.D': 'Weak',
    'grade.F': 'Failing',
    'grade.none': 'Not graded',
    'grade.aria': 'Overall grade {grade}',
    'grade.ariaScore': 'Overall grade {grade}, {score} out of 100',
    'area.reach': 'Website',
    'area.security': 'Security',
    'area.contact': 'Contact',
    'area.presence': 'Presence',
    'area.none': 'no verified claim',
    'area.score': '{n}/100',

    'card.title': 'Digital health card',
    'card.generated': 'Generated {when}',
    'stat.proposed': 'proposed',
    'stat.verified': 'verified',
    'stat.dropped': 'dropped',
    'stat.checksRun': 'checks run',
    'stat.notChecked': 'not checked',
    'stat.seconds': 's',
    'partial.title': 'Partial run. ',
    'partial.body': 'Some steps did not finish; nothing unproven was added in their place.',

    // Partial-run notes written by the agent (src/agent/pipeline.mjs), shown in the visitor's language.
    'partial.search': 'Web search failed ({reason}); the business was identified from the query alone.',
    'partial.planner': 'Planner did not answer ({reason}); code used the query and the search results instead.',
    'partial.proposer': 'Claim proposer did not answer ({reason}); only claims code can put to the gate by itself were checked.',
    'partial.rewrite': 'Owner rewrite did not answer ({reason}); claims are shown in their checked wording.',
    'partial.writer': 'Writer did not answer ({reason}); no summary or pitch was written. The verified claims above stand on their own.',
    'reason.timeout': 'timed out',
    'reason.denied': 'access refused, HTTP {code}',
    'reason.busy': 'service busy, HTTP 429',
    'reason.serverError': 'service error, HTTP {code}',
    'reason.http': 'HTTP {code}',
    'reason.unreadable': 'unreadable answer',
    'reason.timeLimit': 'run time limit reached',
    'reason.budget': 'request limit reached',
    'reason.network': 'network error',

    'ask.emptyHint': 'Type a business name and city, or a web address — or pick an example below.',
    'ask.emptyHintSample': 'Pick one of the four examples below: recorded, free, ready in seconds.',

    'tour.time': '30 s',
    'tour.openShort': 'How it works',
    'tour.dialog': 'How Proofline works',
    'tour.step': 'Step {i} of {n}',
    'tour.next': 'Next',
    'tour.prev': 'Back',
    'tour.done': 'Done',
    'tour.close': 'Close the tour',
    'tour.s1.title': 'What is this?',
    'tour.s1.body': 'Proofline builds a checked profile of a small business from its traces on the web. An AI model (NVIDIA Nemotron) suggests what might be true; Proofline then checks every suggestion itself.',
    'tour.s2.title': 'Where do I start?',
    'tour.s2.body': 'Type a business name and city, or a web address, and press “Check it”. Fastest way to try: click one of the recorded examples — free, no sign-up.',
    'tour.s3.title': 'What is the proof gate?',
    'tour.s3.body': 'Every claim the model proposes goes through the gate: its checks (domain, web page, certificate, map) run again from scratch. A proven claim turns green and stays. A claim without proof turns grey and is dropped — never shown as a finding.',
    'tour.s4.title': 'Reading the result',
    'tour.s4.body': 'When a check finishes you get a grade card, the verified claims, and the dropped ones with their reason. Open “Proof” under a claim to see each check; “Re-run proof” repeats it now. A step that could not run says “not checked” — it never counts as a finding.',

    'verified.title': 'Verified claims',
    'verified.sub': 'Each one passed its proof twice: once when gathered, again at the gate.',
    'verified.none': 'No claim survived the gate, so Proofline asserts nothing about this business. What was dropped, and why, is below.',
    'dropped.title': 'Dropped by the gate',
    'dropped.sub': 'Proposed, then disproved or not provable. Never shown to the owner.',
    'pitch.title': 'Pitch draft',
    'pitch.sub': 'For the seller. Every finding cites a verified claim.',

    'share.aria': 'Link to this report',
    'share.copy': 'Copy link',
    'share.copied': 'Link copied',
    'share.pressCopy': 'Press Ctrl/⌘+C to copy',
    'share.note': 'Read-only link, kept {days} days. It holds the business’s public information and the proofs, nothing about you.',

    'badge.dropped': 'dropped',
    'badge.good': 'verified',
    'badge.issue': 'issue',
    'badge.risk': 'check',
    'claim.forOwner': 'For the owner: {text}',
    'claim.whyDropped': 'Why dropped: ',
    'claim.modelReason': 'Model’s reason: {text}',
    'proof.label_one': 'Proof · {n} check',
    'proof.label_other': 'Proof · {n} checks',
    'proof.checked': 'checked {time}',
    'proof.rerun': 'Re-run proof',
    'proof.running': 'Running…',
    'proof.same': 'same result · {time}',
    'proof.changed': 'changed: now {verdict} · {time}',
    'proof.unreadable': 'The server sent an unreadable answer. Try again.',
    'proof.unreachable': 'Could not reach the server. Try again.',
    'proof.notChecked': '{title} — not checked: {summary}',
    'proof.expectPass': '{title} — expected pass: {summary}',
    'proof.expectFail': '{title} — expected fail: {summary}',
    'verdict.verified': 'verified',
    'verdict.dropped': 'dropped',

    'pitch.cite': 'Show the proof',
    'pitch.citeFor': 'Show the proof for {id}',
    'pitch.none': 'No pitch was written for this run. The verified claims above stand on their own.',
    'pitch.subject': 'Subject: {text}',
    'pitch.copied': 'Draft copied',
    'pitch.copyFailed': 'Copy failed — select the text instead',
    'pitch.copy': 'Copy draft',
    'pitch.noIssues': 'No issues to pitch. This business is in good shape.',
    'pitch.removed': 'Removed before you saw it: ',
    'pitch.note': 'Draft only. Proofline never sends messages.',

    'foot.text': 'Reads public business information only. Built for the Nebius × NVIDIA Global AI Hackathon',
    'foot.source': 'Source on GitHub',
    'foot.license': 'MIT licensed.',

    'short.site_online': 'Site loads with real content',
    'short.site_unreachable': 'Site does not load',
    'short.domain_parked': 'Domain shows a for-sale page',
    'short.https_healthy': 'HTTPS is healthy',
    'short.ssl_expiring_soon': 'Certificate expires soon',
    'short.ssl_invalid': 'Certificate is invalid',
    'short.no_https_redirect': 'No redirect to HTTPS',
    'short.no_contact_path': 'No way to get in touch on site',
    'short.phone_confirmed': 'Phone is on its own site',
    'short.phone_unconfirmed': 'Listed phone may be outdated',
    'short.no_own_website': 'No website of its own',
    'short.on_map': 'Listed on OpenStreetMap',
    'short.not_on_map': 'Missing from OpenStreetMap',
    'short.possibly_closed': 'May have closed',
    'short.possibly_renamed': 'Site carries another name',

    'mini.site_online': 'Site loads',
    'mini.site_unreachable': 'Site is down',
    'mini.domain_parked': 'Domain for sale',
    'mini.https_healthy': 'HTTPS healthy',
    'mini.ssl_expiring_soon': 'Cert expiring',
    'mini.ssl_invalid': 'Cert invalid',
    'mini.no_https_redirect': 'No HTTPS redirect',
    'mini.no_contact_path': 'No contact path',
    'mini.phone_confirmed': 'Phone on own site',
    'mini.phone_unconfirmed': 'Phone may be old',
    'mini.no_own_website': 'No own website',
    'mini.on_map': 'On the map',
    'mini.not_on_map': 'Not on the map',
    'mini.possibly_closed': 'May have closed',
    'mini.possibly_renamed': 'Name differs',

    'hero.h1.label': 'Site loads, real content',
    'hero.h1.statement': 'lumencoffee.example loads and shows real content.',
    'hero.h2.label': 'Site does not load',
    'hero.h2.statement': 'lumencoffee.example does not load (two attempts failed).',
    'hero.h2.reason': 'Website answers over HTTPS: expected fail, got pass — loaded with HTTP 200',
    'hero.h3.label': 'Cert expires in 9 days',
    'hero.h3.statement': 'The security certificate of lumencoffee.example expires within 30 days.',
    'hero.h4.label': 'Site carries another name',
    'hero.h4.statement': 'The site at qrmenu.example uses a different name than “Kuzey Kafe”.',
    'hero.h4.reason': 'qrmenu.example is a listing platform (QR-menu provider), not the business’s own website',
    'hero.h5.label': 'Listed on OpenStreetMap',
    'hero.h5.statement': 'Lumen Coffee Roasters is listed on OpenStreetMap.',
    'hero.h6.label': 'Phone is on its own site',
    'hero.h6.statement': '+90 212 555 30 61 is the business’s own number.',
    'hero.h6.reason': 'The phone number appears on the official site: expected pass, got fail — the site lists another number',
    'hero.h7.label': 'No contact link on site',
    'hero.h7.statement': 'The homepage has no contact form, email link, tap-to-call or WhatsApp link.',

    'blurb.lumen': 'Café with a working site, but a certificate about to expire and no contact button. A stale review claims the site is down.',
    'blurb.harbor': 'Clinic whose domain lapsed and now shows a for-sale page. An old forum post claims a certificate warning.',
    'blurb.atlas': 'Bike shop that may have changed hands: the site now carries another name and number, and a directory marks it closed.',
    'blurb.kuzey': 'Café with no website of its own, only a QR-menu page and Instagram. The planner mistakes the menu platform for its site.',

    // Fixed server messages (src/, server.mjs, worker/), shown as sent in English.
    'srv.notConfigured': 'Live mode is not configured on this demo yet — try a recorded example.',
    'srv.globalQuota': 'Live quota used up today — try a recorded example. It resets at 00:00 UTC.',
    'srv.ipQuota': 'You have used your live checks for today — try a recorded example. They reset at 00:00 UTC.',
    'srv.notSample': 'Recorded mode knows four fictional businesses. Pick one of the examples, or switch to Live search.',
    'srv.notSampleLocal': 'Sample mode knows four fictional businesses. Pick one of the examples, or add keys for live mode.',
    'srv.empty': 'Enter a business name or a domain.',
    'srv.reportMissing': 'This report link has expired or does not exist. Shared reports are kept for 14 days.',
    'srv.subrequests': 'This run reached the demo host’s request limit. Checks that could not run count as “not checked”, never as findings. Try again, or pick a recorded example.',
    'srv.cpu': 'The demo host stopped this run early (time limit). Nothing unproven was claimed. Try again, or pick a recorded example.',
    'srv.rateLimit': 'The model service is busy right now. Try again in a minute, or pick a recorded example.',
    'srv.modelDown': 'The model service did not answer. Try again in a minute, or pick a recorded example.',
    'srv.generic': 'Something went wrong on our side. Try again, or pick a recorded example.',
    'srv.busy': 'Busy with other checks. Try again in a minute.',
    'srv.runExpired': 'Run expired. Start a new check.',
    'srv.recheckLimit': 'Re-check limit reached for today.',
    'srv.hostBusy': 'The demo host is busy. Try again in a minute.',
  },

  tr: {
    'doc.title': 'Proofline — her iddia kanıtıyla gelir',
    'lang.label': 'Dil',
    'lang.en': 'English',
    'lang.tr': 'Türkçe',
    'skip': 'Arama kutusuna geç',
    'brand.home': 'Proofline ana sayfa',

    'shared.eyebrow': 'Paylaşılan Proofline raporu',
    'shared.loading': 'Yükleniyor…',
    'shared.cta': 'Kendi kontrolünü yap',
    'shared.unavailable': 'Bağlantı kullanılamıyor',
    'shared.sample': 'Kayıtlı örnek (kurgusal işletme)',
    'shared.live': 'Canlı arama',
    'shared.when': '{kind} · oluşturulma: {when}',
    'shared.pill': 'Paylaşılan rapor · salt okunur',
    'shared.loadingReport': 'Paylaşılan rapor yükleniyor…',
    'shared.loadFailed': 'Rapor yüklenemedi. Bağlantını kontrol edip sayfayı yenile.',

    'hero.eyebrow': 'İşletme profili ajanı',
    'hero.title': 'Her iddia kanıtıyla gelir.',
    'hero.lede': 'Küçük bir işletme adı ver. Proofline işletmenin web’e dağılmış izlerini toplar; neyin doğru olduğunu NVIDIA Nemotron önerir, ardından Proofline her iddiayı kendisi yeniden kontrol eder. Kanıtlayamadığı her şeyi herkesin gözü önünde eler.',
    'ask.label': 'İşletme adı ve şehir ya da alan adı',
    'ask.placeholder': 'Ad, şehir — ya da alan adı',
    'ask.placeholderSample': 'Aşağıdan bir örnek seç',
    'ask.go': 'Kontrol et',
    'ask.busy': 'Kontrol ediliyor…',
    'modes.legend': 'Mod',
    'modes.sample': 'Kayıtlı örnekler',
    'modes.sampleNote': 'anında · ücretsiz',
    'modes.live': 'Canlı arama',
    'modes.liveNote': 'Nemotron + Tavily',
    'modes.left_one': 'Bugün {n} hak kaldı · Nemotron + Tavily',
    'modes.left_other': 'Bugün {n} hak kaldı · Nemotron + Tavily',
    'modes.quotaUsed': 'bugünkü kota doldu',
    'modes.notConfigured': 'henüz ayarlanmadı',
    'note.sample': 'Kayıtlı mod dört kurgusal işletmeyi yeniden oynatır; her birinde kanıt kapısının yakalaması için bilerek konmuş yanlış bir iddia var. Aşağıdan birini seç.',
    'note.notConfigured': 'Bu demoda canlı mod henüz ayarlanmadı — kayıtlı bir örneği dene.',
    'note.live': 'Canlı arama, Nebius Token Factory üzerindeki NVIDIA Nemotron’u ve Tavily’yi gerçekten çağırır. Küçük bir deneme kredisini korumak için: ziyaretçi başına {perVisitor}, günde toplam {perDay} kontrol; aynı sorgu {hours} saat içinde önbellekten yanıtlanır.',
    'samples.label': 'Örnekler',
    'samples.note': 'Kayıtlı örnekler (kurgusal işletmeler):',
    'stage.caption': 'Kanıt kapısı, örneklerdeki iddialarla: kanıtlananlar yeşile döner, diğerleri elenir.',
    'stage.pause': 'Durdur',
    'stage.play': 'Oynat',
    'stage.aria': 'Animasyon: iddia kartları üç kanıt kapısından geçer. Kanıtlanan dört iddia doğrulandı olarak sabitlenir; kanıtı olmayan üç iddia griye döner ve elenir.',

    'mode.offline': 'çevrim dışı',
    'mode.demoLive': 'Açık demo · kayıtlı + sınırlı canlı arama',
    'mode.demo': 'Açık demo · kayıtlı örnekler',
    'mode.sample': 'Örnek mod · kayıtlı veri, anahtar yok',
    'mode.live': 'Canlı · Nebius Token Factory’de {model}',
    'mode.liveTavily': 'Canlı · Nebius Token Factory’de {model} · Tavily',
    'offline.note': 'Demo sunucusu yanıt vermedi. Bağlantını kontrol edip sayfayı yenile.',

    'trace.title': 'Ajan izi',
    'trace.events': 'İz kayıtları',
    'stages.plan': 'Plan',
    'stages.observe': 'Araçlar',
    'stages.propose': 'İddialar',
    'stages.gate': 'Kapı',
    'stages.verify': 'Doğrula',
    'stages.write': 'Yaz',
    'working.plan': 'Web’de aranıyor ve işletme belirleniyor…',
    'working.observe': 'Kanıt kontrolleri çalışıyor…',
    'working.propose': 'Kanıtlardan iddialar öneriliyor…',
    'working.gate': 'Kanıt kapısı her iddianın kanıtını sıfırdan yeniden çalıştırıyor…',
    'working.verify': 'Doğrulanan iddialar işletme sahibi için yeniden yazılıyor…',
    'working.write': 'Özet ve kaynaklı satış taslağı yazılıyor…',
    'working.default': 'Çalışıyor. Her iddia kanıt kapısından geçince rapor görünecek.',

    'tag.kept': 'geçti',
    'tag.dropped': 'elendi',
    'tag.cache': 'önbellek',
    'tag.start': 'başla',
    'tag.intake': 'girdi',
    'tag.tavily': 'tavily',
    'tag.plan': 'plan',
    'tag.model': 'model',
    'tag.check': 'kontrol',
    'tag.claims': 'iddialar',
    'tag.verify': 'doğrula',
    'tag.write': 'yaz',

    'mark.pass': 'geçti',
    'mark.fail': 'kaldı',
    'mark.na': 'kontrol edilmedi',

    'ev.allMatched_one': '{n} kontrol yeniden çalıştı, hepsi tuttu',
    'ev.allMatched_other': '{n} kontrol yeniden çalıştı, hepsi tuttu',
    'ev.cacheTitle': 'Önbellekten yanıtlandı',
    'ev.cacheMin': 'aynı sorgu {n} dk önce canlı çalıştı · yeni API çağrısı yok · kanıt kontrolleri şimdi yeniden çalıştırılabilir',
    'ev.cacheHours': 'aynı sorgu {n} sa önce canlı çalıştı · yeni API çağrısı yok · kanıt kontrolleri şimdi yeniden çalıştırılabilir',
    'ev.models': 'akıl yürütme: {reasoning} · hızlı: {fast}',
    'ev.parsedDomain': 'Alan adı olarak okundu: {domain}',
    'ev.parsedName': 'Okunan: “{name}”',
    'ev.parsedNameCity': 'Okunan: “{name}”, {city}',
    'ev.results_one': '{n} web sonucu',
    'ev.results_other': '{n} web sonucu',
    'ev.searchFailed': 'arama başarısız: {error}',
    'ev.guard': 'koruma: {text}',
    'ev.toClaims_one': 'Kanıt kapısına {n} iddia',
    'ev.toClaims_other': 'Kanıt kapısına {n} iddia',
    'ev.refused': '{n} iddia katalog dışında, reddedildi',
    'ev.noRewrite': 'Yeniden yazılacak doğrulanmış iddia yok',
    'ev.ownerLines_one': 'Sahip için {n} satır',
    'ev.ownerLines_other': 'Sahip için {n} satır',
    'ev.rewritesRejected_one': '{n} yeniden yazım reddedildi: {reasons}',
    'ev.rewritesRejected_other': '{n} yeniden yazım reddedildi: {reasons}',
    'ev.pitchNone': 'Satış taslağı yazılmadı',
    'ev.pitch_one': 'Satış taslağı: {n} kaynaklı bulgu',
    'ev.pitch_other': 'Satış taslağı: {n} kaynaklı bulgu',
    'ev.uncited_one': 'Kaynaksız {n} cümle çıkarıldı',
    'ev.uncited_other': 'Kaynaksız {n} cümle çıkarıldı',
    'ev.tokensNone': 'token sayısı bildirilmedi',
    'ev.tokens': '{in} giriş → {out} çıkış token',
    'ev.tokensReasoning': '{in} giriş → {out} çıkış token ({reasoning} akıl yürütme)',

    'outcome.accepted': 'kabul edildi',
    'outcome.partial': 'kısmen reddedildi',
    'outcome.rejected': 'reddedildi',
    'outcome.failed': 'yanıt yok',
    'tier.reasoning': 'akıl yürütme',
    'tier.fast': 'hızlı',
    'role.Planner': 'Planlayıcı',
    'role.Claim proposer': 'İddia önerici',
    'role.Owner rewrite': 'Sahip için yeniden yazım',
    'role.Writer': 'Yazar',

    'gate.title': 'Kanıt kapısı',
    'gate.sub': 'Model iddiaları önerir; her iddianın kontrolleri sıfırdan yeniden çalışır. Kanıtlanan geçer (yeşil), kanıtlanamayan elenir (gri) ve bulgu olarak gösterilmez.',
    'gate.skip': 'Animasyonu atla',
    'gate.atGate_one': 'Kanıt kapısında {n} önerilen iddia',
    'gate.atGate_other': 'Kanıt kapısında {n} önerilen iddia',
    'gate.none': 'Model katalogdan hiçbir iddia önermedi, bu yüzden kanıt kapısına bir şey gitmiyor.',
    'gate.running': 'Her iddianın kanıtı sıfırdan yeniden çalıştırılıyor. Kanıtlanan iddialar geçer; diğerleri onları eleyen çizgide durur.',
    'gate.hint': 'Kanıtını görmek için bir kart seç. Elenme nedeni için elenen kartın üzerine gel ya da odakla.',
    'gate.empty': 'Bu çalıştırmada kanıt kapısına hiçbir iddia ulaşmadı; kanıtlanacak ya da elenecek bir şey yoktu.',
    'gate.tallyProposed': 'önerildi',
    'gate.tallyVerified': 'doğrulandı',
    'gate.tallyDropped': 'elendi',
    'gate.identity': 'Kimlik',
    'gate.identity.short': 'Kimlik',
    'gate.web': 'Web · TLS',
    'gate.web.short': 'Web·TLS',
    'gate.reach': 'İletişim · Harita',
    'gate.reach.short': 'İletişim',
    'gate.zoneQueue': 'Önerilen',
    'gate.zoneKept': 'Doğrulandı',
    'gate.zoneDropped': 'Elendi · kanıt yok',
    'gate.stamp': 'kanıt yok',
    'gate.whyDropped': 'Neden elendi',
    'gate.cardVerified': 'Doğrulandı: {statement}. Kanıtını göster.',
    'gate.cardDropped': 'Elendi: {statement}. Kanıtını göster.',
    'gate.cardDroppedWhy': 'Elendi: {statement}. Neden elendi: {reason}. Kanıtını göster.',
    'gate.notProven': 'kanıtlanmadı',

    'error.stopped': 'Çalıştırma bitmeden durdu (bağlantı koptu ya da demo sunucusunun süre sınırı doldu). Çalışmayan kontrollerden hiçbir sonuç çıkarılmadı.',
    'error.retry': 'Yeniden dene',
    'error.pickExample': 'Kayıtlı bir örnek seç',

    'models.title': 'Model çağrıları',
    'models.sample': 'Kayıtlı örnek: modelin yerini kurallara dayalı bir yedek alır, bu yüzden token harcanmaz. Canlı arama aynı adımları Nebius Token Factory üzerinden NVIDIA Nemotron ile çalıştırır.',
    'models.live': 'Bu çalıştırmadaki her NVIDIA Nemotron çağrısı (Nebius Token Factory) ve kod kontrollerinin yanıtla ne yaptığı.',
    'models.noTokens': 'Bu çalıştırmada token sayıları kaydedilmedi.',
    'models.none': 'Bu çalıştırmada model çağrısı kaydedilmedi.',
    'models.in': '{n} giriş',
    'models.out': '{n} çıkış',
    'models.tokensDash': 'token —',
    'models.calls_one': '{n} model çağrısı',
    'models.calls_other': '{n} model çağrısı',
    'models.standIn': 'kurallara dayalı yedek, token yok',
    'models.tokens': '{n} token',
    'models.droppedByGate_one': 'kanıt kapısında {n} iddia elendi',
    'models.droppedByGate_other': 'kanıt kapısında {n} iddia elendi',
    'models.rewritesRejected_one': '{n} yeniden yazım reddedildi',
    'models.rewritesRejected_other': '{n} yeniden yazım reddedildi',
    'legacy.guard': 'koruma: {text}',
    'legacy.outside': '{n} iddia katalog dışında',
    'legacy.removed': 'kaynak denetimi {n} cümleyi çıkardı',

    'grade.A': 'Güçlü',
    'grade.B': 'İyi',
    'grade.C': 'Geliştirilmeli',
    'grade.D': 'Zayıf',
    'grade.F': 'Yetersiz',
    'grade.none': 'Notlanmadı',
    'grade.aria': 'Genel not {grade}',
    'grade.ariaScore': 'Genel not {grade}, 100 üzerinden {score}',
    'area.reach': 'Web sitesi',
    'area.security': 'Güvenlik',
    'area.contact': 'İletişim',
    'area.presence': 'Görünürlük',
    'area.none': 'doğrulanmış iddia yok',
    'area.score': '{n}/100',

    'card.title': 'Dijital sağlık kartı',
    'card.generated': 'Oluşturulma: {when}',
    'stat.proposed': 'önerildi',
    'stat.verified': 'doğrulandı',
    'stat.dropped': 'elendi',
    'stat.checksRun': 'kontrol çalıştı',
    'stat.notChecked': 'kontrol edilmedi',
    'stat.seconds': 'sn',
    'partial.title': 'Yarım kalan çalıştırma. ',
    'partial.body': 'Bazı adımlar bitmedi; yerlerine kanıtlanmamış hiçbir şey eklenmedi.',

    'partial.search': 'Web araması yapılamadı ({reason}); işletme yalnızca yazılan sorgudan tanındı.',
    'partial.planner': 'Planlayıcı model yanıt vermedi ({reason}); kod, sorguyu ve arama sonuçlarını kullandı.',
    'partial.proposer': 'İddia önerici model yanıt vermedi ({reason}); yalnızca kodun kendi başına kapıya koyabildiği iddialar kontrol edildi.',
    'partial.rewrite': 'Sahip için yeniden yazım yanıt vermedi ({reason}); iddialar kontrol edildikleri haliyle gösteriliyor.',
    'partial.writer': 'Yazar model yanıt vermedi ({reason}); özet ve satış taslağı yazılmadı. Yukarıdaki doğrulanan iddialar kendi başına geçerli.',
    'reason.timeout': 'zaman aşımı',
    'reason.denied': 'erişim reddedildi, HTTP {code}',
    'reason.busy': 'hizmet yoğun, HTTP 429',
    'reason.serverError': 'hizmet hatası, HTTP {code}',
    'reason.http': 'HTTP {code}',
    'reason.unreadable': 'okunamayan yanıt',
    'reason.timeLimit': 'çalıştırma süre sınırı doldu',
    'reason.budget': 'istek sınırı doldu',
    'reason.network': 'ağ hatası',

    'ask.emptyHint': 'Bir işletme adı ve şehir ya da web adresi yaz — veya aşağıdan bir örnek seç.',
    'ask.emptyHintSample': 'Aşağıdaki dört örnekten birini seç: kayıtlı, ücretsiz, saniyeler içinde hazır.',

    'tour.time': '30 sn',
    'tour.openShort': 'Nasıl çalışır?',
    'tour.dialog': 'Proofline nasıl çalışır',
    'tour.step': 'Adım {i} / {n}',
    'tour.next': 'İleri',
    'tour.prev': 'Geri',
    'tour.done': 'Bitti',
    'tour.close': 'Turu kapat',
    'tour.s1.title': 'Bu ne?',
    'tour.s1.body': 'Proofline küçük bir işletmenin web’deki izlerinden kontrol edilmiş bir profil çıkarır. Yapay zekâ modeli (NVIDIA Nemotron) neyin doğru olabileceğini önerir; Proofline her öneriyi kendisi kontrol eder.',
    'tour.s2.title': 'Nereden başlarım?',
    'tour.s2.body': 'Bir işletme adı ve şehir ya da web adresi yaz, “Kontrol et”e bas. En hızlı deneme: kayıtlı örneklerden birine tıkla — ücretsiz, üyelik yok.',
    'tour.s3.title': 'Kanıt kapısı ne?',
    'tour.s3.body': 'Modelin önerdiği her iddia kapıdan geçer: kontrolleri (alan adı, web sayfası, sertifika, harita) sıfırdan yeniden çalışır. Kanıtlanan iddia yeşile döner ve kalır. Kanıtı olmayan griye döner ve elenir — asla bulgu olarak gösterilmez.',
    'tour.s4.title': 'Sonucu okumak',
    'tour.s4.body': 'Kontrol bitince bir not kartı, doğrulanan iddialar ve elenenler nedenleriyle birlikte gelir. Bir iddianın altındaki “Kanıt”ı açınca her kontrolü görürsün; “Kanıtı yeniden çalıştır” onu şimdi tekrarlar. Çalışamayan bir adım “kontrol edilmedi” yazar — asla bulgu sayılmaz.',

    'verified.title': 'Doğrulanan iddialar',
    'verified.sub': 'Her biri kanıtını iki kez geçti: toplanırken bir kez, kanıt kapısında bir kez daha.',
    'verified.none': 'Kanıt kapısından hiçbir iddia geçemedi; Proofline bu işletme hakkında hiçbir şey iddia etmiyor. Nelerin neden elendiği aşağıda.',
    'dropped.title': 'Kanıt kapısında elenenler',
    'dropped.sub': 'Önerildi, sonra çürütüldü ya da kanıtlanamadı. İşletme sahibine asla gösterilmez.',
    'pitch.title': 'Satış taslağı',
    'pitch.sub': 'Satıcı için. Her bulgu doğrulanmış bir iddiaya dayanır.',

    'share.aria': 'Bu raporun bağlantısı',
    'share.copy': 'Bağlantıyı kopyala',
    'share.copied': 'Bağlantı kopyalandı',
    'share.pressCopy': 'Kopyalamak için Ctrl/⌘+C',
    'share.note': 'Salt okunur bağlantı, {days} gün saklanır. İçinde işletmenin herkese açık bilgileri ve kanıtlar var, senin hakkında hiçbir şey yok.',

    'badge.dropped': 'elendi',
    'badge.good': 'doğrulandı',
    'badge.issue': 'sorun',
    'badge.risk': 'kontrol et',
    'claim.forOwner': 'İşletme sahibi için: {text}',
    'claim.whyDropped': 'Neden elendi: ',
    'claim.modelReason': 'Modelin gerekçesi: {text}',
    'proof.label_one': 'Kanıt · {n} kontrol',
    'proof.label_other': 'Kanıt · {n} kontrol',
    'proof.checked': 'kontrol edildi: {time}',
    'proof.rerun': 'Kanıtı yeniden çalıştır',
    'proof.running': 'Çalışıyor…',
    'proof.same': 'sonuç aynı · {time}',
    'proof.changed': 'değişti: artık {verdict} · {time}',
    'proof.unreadable': 'Sunucu okunamayan bir yanıt gönderdi. Yeniden dene.',
    'proof.unreachable': 'Sunucuya ulaşılamadı. Yeniden dene.',
    'proof.notChecked': '{title} — kontrol edilmedi: {summary}',
    'proof.expectPass': '{title} — geçmesi bekleniyor: {summary}',
    'proof.expectFail': '{title} — kalması bekleniyor: {summary}',
    'verdict.verified': 'doğrulandı',
    'verdict.dropped': 'elendi',

    'pitch.cite': 'Kanıtı göster',
    'pitch.citeFor': '{id} için kanıtı göster',
    'pitch.none': 'Bu çalıştırmada satış taslağı yazılmadı. Yukarıdaki doğrulanmış iddialar kendi başına geçerli.',
    'pitch.subject': 'Konu: {text}',
    'pitch.copied': 'Taslak kopyalandı',
    'pitch.copyFailed': 'Kopyalanamadı — metni elle seç',
    'pitch.copy': 'Taslağı kopyala',
    'pitch.noIssues': 'Önerilecek sorun yok. Bu işletme iyi durumda.',
    'pitch.removed': 'Sen görmeden çıkarıldı: ',
    'pitch.note': 'Yalnız taslak. Proofline hiçbir zaman mesaj göndermez.',

    'foot.text': 'Yalnız herkese açık işletme bilgilerini okur. Nebius × NVIDIA Global AI Hackathon için yapıldı',
    'foot.source': 'GitHub’da kaynak kod',
    'foot.license': 'MIT lisanslı.',

    'short.site_online': 'Site gerçek içerikle açılıyor',
    'short.site_unreachable': 'Site açılmıyor',
    'short.domain_parked': 'Alan adı satılık görünüyor',
    'short.https_healthy': 'HTTPS sorunsuz',
    'short.ssl_expiring_soon': 'Sertifikanın süresi doluyor',
    'short.ssl_invalid': 'Sertifika geçersiz',
    'short.no_https_redirect': 'HTTPS’e yönlendirme yok',
    'short.no_contact_path': 'Sitede iletişim yolu yok',
    'short.phone_confirmed': 'Telefon kendi sitesinde',
    'short.phone_unconfirmed': 'Kayıtlı telefon eski olabilir',
    'short.no_own_website': 'Kendi web sitesi yok',
    'short.on_map': 'OpenStreetMap’te kayıtlı',
    'short.not_on_map': 'OpenStreetMap’te yok',
    'short.possibly_closed': 'Kapanmış olabilir',
    'short.possibly_renamed': 'Sitede başka bir ad var',

    'mini.site_online': 'Site açılıyor',
    'mini.site_unreachable': 'Site açılmıyor',
    'mini.domain_parked': 'Alan adı satılık',
    'mini.https_healthy': 'HTTPS sorunsuz',
    'mini.ssl_expiring_soon': 'Sertifika bitiyor',
    'mini.ssl_invalid': 'Sertifika geçersiz',
    'mini.no_https_redirect': 'HTTPS’e geçmiyor',
    'mini.no_contact_path': 'İletişim yolu yok',
    'mini.phone_confirmed': 'Telefon sitede',
    'mini.phone_unconfirmed': 'Telefon eski mi?',
    'mini.no_own_website': 'Kendi sitesi yok',
    'mini.on_map': 'Haritada var',
    'mini.not_on_map': 'Haritada yok',
    'mini.possibly_closed': 'Kapanmış olabilir',
    'mini.possibly_renamed': 'Ad farklı',

    'hero.h1.label': 'Site açılıyor, içerik gerçek',
    'hero.h1.statement': 'lumencoffee.example açılıyor ve gerçek içerik gösteriyor.',
    'hero.h2.label': 'Site açılmıyor',
    'hero.h2.statement': 'lumencoffee.example açılmıyor (iki deneme başarısız).',
    'hero.h2.reason': 'Site HTTPS üzerinden yanıt veriyor: beklenen başarısız, sonuç başarılı — HTTP 200 ile açıldı',
    'hero.h3.label': 'Sertifika 9 günde bitiyor',
    'hero.h3.statement': 'lumencoffee.example’ın güvenlik sertifikası 30 gün içinde doluyor.',
    'hero.h4.label': 'Sitede başka bir ad var',
    'hero.h4.statement': 'qrmenu.example’daki site “Kuzey Kafe” yerine başka bir ad kullanıyor.',
    'hero.h4.reason': 'qrmenu.example bir listeleme platformu (QR menü hizmeti), işletmenin kendi sitesi değil',
    'hero.h5.label': 'OpenStreetMap’te kayıtlı',
    'hero.h5.statement': 'Lumen Coffee Roasters OpenStreetMap’te kayıtlı.',
    'hero.h6.label': 'Telefon kendi sitesinde',
    'hero.h6.statement': '+90 212 555 30 61 işletmenin kendi numarası.',
    'hero.h6.reason': 'Telefon numarası resmî sitede geçiyor: beklenen başarılı, sonuç başarısız — sitede başka bir numara var',
    'hero.h7.label': 'Sitede iletişim bağlantısı yok',
    'hero.h7.statement': 'Ana sayfada iletişim formu, e-posta bağlantısı, dokunarak arama ya da WhatsApp bağlantısı yok.',

    'blurb.lumen': 'Sitesi çalışan bir kafe; ama sertifikası bitmek üzere ve iletişim düğmesi yok. Eski bir yorum sitenin açılmadığını iddia ediyor.',
    'blurb.harbor': 'Alan adının süresi dolmuş, artık satılık sayfası gösteren bir klinik. Eski bir forum gönderisi sertifika uyarısı olduğunu iddia ediyor.',
    'blurb.atlas': 'El değiştirmiş olabilecek bir bisiklet tamircisi: site artık başka bir ad ve numara taşıyor, bir rehber de işletmeyi kapalı gösteriyor.',
    'blurb.kuzey': 'Kendi web sitesi olmayan bir kafe; yalnız bir QR menü sayfası ve Instagram’ı var. Planlayıcı menü platformunu işletmenin sitesi sanıyor.',

    'srv.notConfigured': 'Bu demoda canlı mod henüz ayarlanmadı — kayıtlı bir örneği dene.',
    'srv.globalQuota': 'Bugünkü canlı kota doldu — kayıtlı bir örneği dene. Kota her gün 00:00 UTC’de (TSİ 03:00) sıfırlanır.',
    'srv.ipQuota': 'Bugünkü canlı kontrol hakkını kullandın — kayıtlı bir örneği dene. Haklar her gün 00:00 UTC’de (TSİ 03:00) yenilenir.',
    'srv.notSample': 'Kayıtlı mod dört kurgusal işletmeyi tanır. Örneklerden birini seç ya da Canlı arama’ya geç.',
    'srv.notSampleLocal': 'Örnek mod dört kurgusal işletmeyi tanır. Örneklerden birini seç ya da canlı mod için anahtar ekle.',
    'srv.empty': 'Bir işletme adı ya da alan adı yaz.',
    'srv.reportMissing': 'Bu rapor bağlantısının süresi dolmuş ya da böyle bir rapor yok. Paylaşılan raporlar 14 gün saklanır.',
    'srv.subrequests': 'Bu çalıştırma demo sunucusunun istek sınırına ulaştı. Çalışamayan kontroller bulgu değil, “kontrol edilmedi” sayılır. Yeniden dene ya da kayıtlı bir örnek seç.',
    'srv.cpu': 'Demo sunucusu bu çalıştırmayı erken durdurdu (süre sınırı). Kanıtlanmamış hiçbir şey iddia edilmedi. Yeniden dene ya da kayıtlı bir örnek seç.',
    'srv.rateLimit': 'Model hizmeti şu an yoğun. Bir dakika sonra yeniden dene ya da kayıtlı bir örnek seç.',
    'srv.modelDown': 'Model hizmeti yanıt vermedi. Bir dakika sonra yeniden dene ya da kayıtlı bir örnek seç.',
    'srv.generic': 'Bizim tarafta bir şeyler ters gitti. Yeniden dene ya da kayıtlı bir örnek seç.',
    'srv.busy': 'Başka kontrollerle meşgul. Bir dakika sonra yeniden dene.',
    'srv.runExpired': 'Çalıştırmanın süresi doldu. Yeni bir kontrol başlat.',
    'srv.recheckLimit': 'Bugünkü yeniden kontrol sınırına ulaşıldı.',
    'srv.hostBusy': 'Demo sunucusu meşgul. Bir dakika sonra yeniden dene.',
  },
};

// ---- choosing the language -------------------------------------------------------------------

const norm = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return s.startsWith('tr') ? 'tr' : s.startsWith('en') ? 'en' : null;
};

/** Pure: ?lang= first, then the saved choice, then the browser language (tr* -> tr), else en. */
export function pickLang({ search = '', stored = null, navLangs = [] } = {}) {
  let fromUrl = null;
  try { fromUrl = norm(new URLSearchParams(search).get('lang')); } catch { fromUrl = null; }
  if (fromUrl) return fromUrl;
  const saved = norm(stored);
  if (saved) return saved;
  const first = [].concat(navLangs || []).find(Boolean);
  return norm(first) === 'tr' ? 'tr' : 'en';
}

function readStored() {
  try { return globalThis.localStorage?.getItem(STORE_KEY) ?? null; } catch { return null; }
}
function writeStored(l) {
  try { globalThis.localStorage?.setItem(STORE_KEY, l); } catch { /* private mode: the choice lasts this page only */ }
}

/** The language for this page view, read from the browser environment (en outside a browser). */
export function detectLang() {
  if (typeof location === 'undefined') return 'en';
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  return pickLang({ search: location.search, stored: readStored(), navLangs: nav });
}

let current = 'en';
const listeners = new Set();

export function getLang() { return current; }
export function locale() { return LOCALE[current]; }

/** Switches the language. persist: remember the visitor's choice. */
export function setLang(l, { persist = false } = {}) {
  const next = LANGS.includes(l) ? l : 'en';
  if (persist) writeStored(next);
  if (next === current) return;
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of listeners) fn(next);
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---- text ------------------------------------------------------------------------------------

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));

/** t('key', { n: 2, name: 'x' }). Falls back to English, then to the key itself. */
export function t(key, vars) {
  const d = DICT[current] || DICT.en;
  let k = key;
  if (vars && typeof vars.n === 'number' && (`${key}_one` in DICT.en)) {
    const cat = new Intl.PluralRules(LOCALE[current]).select(vars.n) === 'one' ? 'one' : 'other';
    k = `${key}_${cat}`;
  }
  const s = d[k] ?? DICT.en[k];
  if (s == null) return key;
  return fill(s, vars ? { ...vars, n: vars.n != null && typeof vars.n === 'number' ? num(vars.n) : vars.n } : vars);
}

/** t() when the key exists, otherwise the fallback (for labels that may come from newer servers). */
export function tOr(key, fallback) {
  return (key in DICT.en) ? t(key) : fallback;
}

// ---- numbers and dates -----------------------------------------------------------------------

export function num(n, opts) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat(LOCALE[current], opts).format(Number(n));
}

/** Seconds from milliseconds: one decimal under 10 s. "2.4 s" / "2,4 sn". */
export function secs(ms) {
  const d = ms < 10000 ? 1 : 0;
  return `${num(ms / 1000, { minimumFractionDigits: d, maximumFractionDigits: d })} ${t('stat.seconds')}`;
}

export function dateTime(at) {
  return new Date(at).toLocaleString(LOCALE[current], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

export function time(at) {
  return new Date(at).toLocaleTimeString(LOCALE[current]);
}

// ---- fixed server messages -------------------------------------------------------------------

const SERVER_KEYS = Object.keys(DICT.en).filter((k) => k.startsWith('srv.'));

/** A known fixed message from the server, in the current language; anything else as sent. */
export function serverText(msg) {
  const s = String(msg ?? '');
  const key = SERVER_KEYS.find((k) => DICT.en[k] === s);
  return key ? t(key) : s;
}

// ---- partial-run notes -----------------------------------------------------------------------

const PARTIAL = [
  [/^Web search failed \((.*)\); the business was identified/, 'partial.search'],
  [/^Planner did not answer \((.*)\); code used/, 'partial.planner'],
  [/^Claim proposer did not answer \((.*)\); only claims/, 'partial.proposer'],
  [/^Owner rewrite did not answer \((.*)\); claims are shown/, 'partial.rewrite'],
  [/^Writer did not answer \((.*)\); no summary/, 'partial.writer'],
];

/** A short, plain reason for a technical error text (timeouts, HTTP codes, unreadable replies). */
export function reasonText(detail) {
  const d = String(detail ?? '');
  if (/run time limit/i.test(d)) return t('reason.timeLimit');
  if (/request budget|subrequest/i.test(d)) return t('reason.budget');
  if (/no answer within|timed? ?out|TimeoutError|aborted due to timeout/i.test(d)) return t('reason.timeout');
  const http = /HTTP (\d{3})/.exec(d);
  if (http) {
    const code = Number(http[1]);
    if (code === 401 || code === 403) return t('reason.denied', { code: String(code) });
    if (code === 429) return t('reason.busy');
    if (code >= 500) return t('reason.serverError', { code: String(code) });
    return t('reason.http', { code: String(code) });
  }
  if (/JSON|empty model reply|Cannot read prop|reading '/i.test(d)) return t('reason.unreadable');
  if (/fetch failed|ENOTFOUND|ECONN|socket|network/i.test(d)) return t('reason.network');
  return d;
}

/** A partial-run note from the agent, in the current language, with a plain reason instead of raw error text. */
export function partialText(note) {
  const s = String(note ?? '');
  for (const [re, key] of PARTIAL) {
    const m = re.exec(s);
    if (m) return t(key, { reason: reasonText(m[1]) });
  }
  return s;
}

// ---- static page text ------------------------------------------------------------------------

/**
 * Fills [data-i18n] (textContent) and [data-i18n-attr="attr:key;attr:key"] under root.
 */
export function applyStatic(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((n) => {
    for (const pair of n.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) n.setAttribute(attr, t(key));
    }
  });
}

// The language for this page view is set as soon as this module loads (before the UI renders).
if (typeof document !== 'undefined') {
  current = detectLang();
  document.documentElement.lang = current;
}
