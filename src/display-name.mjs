// The name shown on the report card. The user may type "sakal kafe ankara" (lowercase, with the
// city glued on); the card should read "Sakal Kafe Pub". Order of preference:
//   1. the name the planner found, when it is a real name and not the query echoed back;
//   2. a search-result title segment that names the business ("Sakal Kafe Pub, Ankara - Tripadvisor");
//   3. the query without the city, title-cased.
// Display only: the checks keep using ctx.name.

import { fold } from './text.mjs';

// Turkish provinces and a few large districts, folded (see fold()). Used to strip a trailing city
// from "name city" queries typed without a comma.
const PLACES = new Set(`adana adiyaman afyon afyonkarahisar agri aksaray amasya ankara antalya ardahan artvin aydin
balikesir bartin batman bayburt bilecik bingol bitlis bolu burdur bursa canakkale cankiri corum denizli diyarbakir
duzce edirne elazig erzincan erzurum eskisehir gaziantep antep giresun gumushane hakkari hatay igdir isparta istanbul
izmir kahramanmaras maras karabuk karaman kars kastamonu kayseri kilis kirikkale kirklareli kirsehir kocaeli izmit
konya kutahya malatya manisa mardin mersin mugla mus nevsehir nigde ordu osmaniye rize sakarya samsun sanliurfa urfa
siirt sinop sirnak sivas tekirdag tokat trabzon tunceli usak van yalova yozgat zonguldak
kadikoy besiktas beyoglu uskudar sisli bakirkoy cankaya kizilay alsancak karsiyaka bornova bodrum alanya fethiye
kas kemer cesme marmaris kusadasi nilufer`.split(/\s+/).filter(Boolean));

const SEP = /\s+[|\-–—:·•]\s+|,\s*/;

function stripPlace(name, city) {
  const cityWords = new Set(fold(city).split(' ').filter(Boolean));
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const last = fold(words[words.length - 1]);
    if (cityWords.has(last) || PLACES.has(last)) words.pop();
    else break;
  }
  return words.join(' ');
}

function titleCase(s) {
  return String(s).split(/\s+/).filter(Boolean)
    .map((w) => (/\p{Lu}/u.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const hasCapital = (s) => /\p{Lu}/u.test(String(s || ''));

/** Best display name for the card. All inputs optional; returns '' only when nothing is known. */
export function displayName({ raw = '', planName = '', city = '', results = [] } = {}) {
  const base = stripPlace(String(raw).split(',')[0], city);
  const baseTokens = fold(base).split(' ').filter(Boolean);

  // 1. Planner's name, when it is a properly written name and not just the query echoed back.
  // Equal to the query is fine when the user wrote it properly ("Kuzey Kafe").
  if (planName && hasCapital(planName) && (fold(planName) !== fold(raw) || hasCapital(raw))) {
    return stripPlace(String(planName).split(',')[0].trim(), city);
  }

  // 2. A search-result title segment that contains every word of the query (minus the city).
  if (baseTokens.length) {
    for (const r of results || []) {
      for (const seg of String(r?.title || '').split(SEP)) {
        const s = seg.trim();
        if (!s || !hasCapital(s)) continue;
        const tokens = fold(s).split(' ').filter(Boolean);
        if (tokens.length > baseTokens.length + 3) continue;
        if (tokens[0] !== baseTokens[0] || !baseTokens.every((t) => tokens.includes(t))) continue;
        return stripPlace(s, city);
      }
    }
  }

  // 3. Planner's name or the query, minus the city, title-cased.
  const fallback = planName ? stripPlace(String(planName).split(',')[0], city) : base;
  return titleCase(fallback || raw);
}
