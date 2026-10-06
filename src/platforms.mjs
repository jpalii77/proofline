// Hosts that are NOT a business's own website: listing platforms, directories, marketplaces,
// social networks, link hubs, maps and menu/QR-menu providers. A page on one of these can prove
// that the business is present somewhere, never what "their website" does or does not have.
//
// Maintenance: plain data. Add a host (registrable domain, no "www.") to the right group.
// A host matches itself and every subdomain (e.g. "instagram.com" covers "l.instagram.com").
// Country variants of the same brand must be listed explicitly (google.* is handled by a pattern).

export const PLATFORM_HOSTS = {
  'menu / QR-menu provider': [
    'menulio.com.tr', 'menulio.com', 'qrmenu.com.tr', 'qr-menu.com.tr', 'menum.com.tr', 'finedinemenu.com',
    'menu.app', 'mymenu.com.tr', 'qrmenuler.com', 'menupix.com', 'menuqr.com.tr', 'adisyo.com',
    'qrmenu.example', // fictional platform used by SAMPLE_MODE
  ],
  'food delivery / ordering': [
    'yemeksepeti.com', 'getir.com', 'trendyolgo.com', 'trendyol.com', 'migros.com.tr', 'ubereats.com',
    'deliveroo.com', 'glovoapp.com', 'wolt.com', 'doordash.com', 'grubhub.com', 'just-eat.com',
  ],
  'review / directory': [
    'tripadvisor.com', 'tripadvisor.com.tr', 'foursquare.com', 'yelp.com', 'zomato.com', 'restaurantguru.com',
    'restaurantguru.com.tr', 'mekan360.com', 'nerede.com.tr', 'yandex.com.tr', 'yandex.com', 'cylex.com.tr',
    'bulurum.com', 'yellowpages.com', 'sikayetvar.com', 'birlikte.com', 'firmasec.com', 'hotfrog.com.tr',
  ],
  'booking / travel': [
    'booking.com', 'airbnb.com', 'airbnb.com.tr', 'hotels.com', 'expedia.com', 'agoda.com', 'trivago.com',
    'etstur.com', 'tatilbudur.com', 'jollytur.com', 'opentable.com', 'thefork.com',
  ],
  'marketplace / services': [
    'sahibinden.com', 'armut.com', 'bionluk.com', 'hepsiburada.com', 'n11.com', 'amazon.com', 'amazon.com.tr',
    'etsy.com', 'letgo.com', 'dolap.com',
  ],
  'social network / link hub': [
    'instagram.com', 'facebook.com', 'fb.com', 'm.facebook.com', 'tiktok.com', 'x.com', 'twitter.com',
    'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com', 'threads.net', 'snapchat.com', 'reddit.com',
    'wa.me', 'whatsapp.com', 't.me', 'linktr.ee', 'linkin.bio', 'beacons.ai', 'bio.link', 'taplink.cc',
  ],
  'maps': [
    'maps.app.goo.gl', 'goo.gl', 'g.page', 'openstreetmap.org', 'maps.apple.com', 'here.com', 'waze.com',
  ],
};

// Site builders host real own sites on subdomains (kafe-adi.wixsite.com). Such a host counts as
// an own site only when the subdomain itself names the business; the bare builder domain and
// path-based pages under it never do.
export const SITE_BUILDER_HOSTS = [
  'wixsite.com', 'wix.com', 'squarespace.com', 'webnode.com', 'webnode.com.tr', 'business.site',
  'weebly.com', 'wordpress.com', 'blogspot.com', 'jimdosite.com', 'carrd.co', 'godaddysites.com',
  'ueniweb.com', 'site123.me', 'ikas.shop', 'myshopify.com', 'ticimax.com', 'tilda.ws', 'github.io',
];

const GOOGLE = /(^|\.)google\.[a-z.]{2,6}$/; // google.com, google.com.tr, maps.google.de ...

function suffixMatch(host, list) {
  return list.find((d) => host === d || host.endsWith(`.${d}`)) || null;
}

/**
 * What kind of host is this?
 *   { kind: 'platform', label, matched }  a listing/social/directory host: never an own site
 *   { kind: 'builder', matched, sub }     a site-builder host; `sub` is the business-chosen label (or null)
 *   { kind: 'independent' }               anything else: may be an own site, if the evidence says so
 */
export function classifyHost(rawHost) {
  const host = String(rawHost || '').toLowerCase().replace(/^www\./, '');
  if (!host) return { kind: 'independent' };
  if (GOOGLE.test(host)) return { kind: 'platform', label: 'maps / search', matched: host };
  for (const [label, list] of Object.entries(PLATFORM_HOSTS)) {
    const m = suffixMatch(host, list);
    if (m) return { kind: 'platform', label, matched: m };
  }
  const b = suffixMatch(host, SITE_BUILDER_HOSTS);
  if (b) {
    const sub = host === b ? null : host.slice(0, -(b.length + 1)).split('.').pop();
    return { kind: 'builder', matched: b, sub };
  }
  return { kind: 'independent' };
}

export function isPlatformHost(host) {
  return classifyHost(host).kind === 'platform';
}
