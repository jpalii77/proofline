// SAMPLE_MODE brain: a deterministic, rule-based stand-in for Nemotron so the whole product
// runs with no keys. It has the same interface as the live brain. It is honest about what it is:
// the trace labels every step "sample (rule-based)".
//
// Each fixture may include `planted` claims: plausible-but-wrong claims a model could make from
// stale web data (e.g. "site is down" from an old review). They exist to show the gate dropping them.

import { CLAIM_TYPES } from '../claims.mjs';

const MODEL = 'sample (rule-based)';


function obs(observations, id) {
  return observations.find((o) => o.check === id) || { pass: null };
}

const OWNER_TEXT = {
  site_online: 'Your website opens and shows your business.',
  site_unreachable: 'Your website does not open for visitors right now.',
  domain_parked: 'Your web address shows a “for sale” or placeholder page instead of your business.',
  https_healthy: 'Your site is secure: valid certificate and visitors are sent to the safe https version.',
  ssl_expiring_soon: 'Your site’s security certificate runs out soon; after that, browsers will warn visitors away.',
  ssl_invalid: 'Browsers show a security warning on your site because its certificate is expired or invalid.',
  no_https_redirect: 'People who type your address without “https” land on an insecure version of your site.',
  no_contact_path: 'Visitors can’t contact you from your homepage: no form, email, call or WhatsApp button.',
  phone_confirmed: 'Your phone number on the web matches the one on your own site.',
  phone_unconfirmed: 'The phone number listed for you online is not on your own site; it may be outdated.',
  on_map: 'You are on OpenStreetMap, which many map apps reuse.',
  not_on_map: 'You are missing from OpenStreetMap, which many map apps reuse.',
  possibly_closed: 'A public page says you may have closed. If you are open, that page needs correcting.',
  possibly_renamed: 'Your website shows a different name than your listings; customers may get confused.',
  no_own_website: 'You have no website of your own yet; people only find you on listing and menu platforms.',
};

const PITCH_LINE = {
  domain_parked: 'your web address currently shows a for-sale page, so people searching for you land on an ad',
  site_unreachable: 'your website does not open right now',
  ssl_expiring_soon: 'your security certificate expires within 30 days, after which browsers will warn visitors',
  ssl_invalid: 'browsers currently show a security warning on your site',
  no_https_redirect: 'visitors who type your address without https stay on an insecure page',
  no_contact_path: 'there is no way to contact you from the homepage',
  phone_unconfirmed: 'the phone number in online listings is not on your own site',
  not_on_map: 'you are missing from OpenStreetMap',
  possibly_renamed: 'your site and your listings use different names',
  possibly_closed: 'a public listing says you may have closed',
  no_own_website: 'you have no website of your own yet; searches only lead to listing and menu platforms',
};

export function createSampleBrain(sample, { thinkMs = 0 } = {}) {
  const reply = async (json) => {
    const ms = thinkMs ? Math.round(thinkMs * (0.7 + Math.random() * 0.6)) : 0;
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return { json, model: MODEL, ms };
  };
  return {
    models: { reasoning: MODEL, fast: MODEL, provider: 'none (SAMPLE_MODE)' },

    plan: ({ grounding }) => {
      const domain = grounding.domains.includes(sample.domain) ? sample.domain : null;
      const phone = sample.listedPhone || null;
      return reply({
        name: sample.name,
        city: sample.city,
        domain,
        phone,
        reasoning: `Search results point to ${domain || 'no clear website'}${phone ? ` and list ${phone}` : ''}.`,
      });
    },

    propose: ({ ctx, observations }) => {
      const claims = [];
      const add = (type, rationale) => claims.push({ type, rationale });
      if (ctx.domain && ctx.ownSite) {
        const reach = obs(observations, 'http.reachable');
        const parked = obs(observations, 'page.not_parked');
        if (reach.pass === false) add('site_unreachable', reach.summary);
        if (reach.pass && parked.pass) add('site_online', parked.summary);
        if (reach.pass && parked.pass === false) add('domain_parked', parked.summary);
        const tlsObs = obs(observations, 'tls.cert_valid');
        const days = tlsObs.observed?.daysLeft;
        if (typeof days === 'number' && (days < 0 || tlsObs.observed?.authorized === false)) add('ssl_invalid', tlsObs.summary);
        else if (typeof days === 'number' && days < 30) add('ssl_expiring_soon', tlsObs.summary);
        if (tlsObs.pass === true && obs(observations, 'http.https_redirect').pass === true) add('https_healthy', tlsObs.summary);
        if (obs(observations, 'http.https_redirect').pass === false) add('no_https_redirect', obs(observations, 'http.https_redirect').summary);
        if (obs(observations, 'page.contact_path').pass === false) add('no_contact_path', obs(observations, 'page.contact_path').summary);
        const ph = obs(observations, 'page.phone_listed');
        if (ph.pass === true) add('phone_confirmed', ph.summary);
        if (ph.pass === false) add('phone_unconfirmed', ph.summary);
        if (parked.pass && obs(observations, 'page.name_match').pass === false) add('possibly_renamed', obs(observations, 'page.name_match').summary);
      }
      if (obs(observations, 'web.own_site_found').pass === false) add('no_own_website', obs(observations, 'web.own_site_found').summary);
      const map = obs(observations, 'osm.listed');
      if (map.pass === true) add('on_map', map.summary);
      if (map.pass === false) add('not_on_map', map.summary);
      if (obs(observations, 'web.no_closure_signal').pass === false) add('possibly_closed', obs(observations, 'web.no_closure_signal').summary);
      for (const p of sample.planted || []) claims.push(p);
      return reply({ claims });
    },

    verify: ({ claims }) => reply({
      claims: claims.map((c) => ({ id: c.id, owner_text: OWNER_TEXT[c.type] || c.statement })),
    }),

    write: ({ ctx, claims }) => {
      const issues = claims.filter((c) => CLAIM_TYPES[c.type]?.tone !== 'good');
      const goods = claims.filter((c) => CLAIM_TYPES[c.type]?.tone === 'good');
      const name = ctx.name || ctx.domain;
      const owner_summary = issues.length
        ? `${name} has ${issues.length} verified issue${issues.length > 1 ? 's' : ''} online${goods.length ? `, and ${goods.length} thing${goods.length > 1 ? 's' : ''} already working` : ''}. Each item below links to the check that proves it.`
        : `${name} looks healthy online. Every item below links to the check that proves it.`;
      const findings = issues
        .filter((c) => PITCH_LINE[c.type])
        .slice(0, 3)
        .map((c) => ({ text: `I noticed ${PITCH_LINE[c.type]}.`, cites: [c.id] }));
      // A planted, uncited sentence: the write step must strip it.
      findings.push({ text: 'You are losing about 40% of your customers because of this.', cites: [] });
      return reply({
        owner_summary,
        pitch: {
          subject: `${name}: ${issues.length ? `${issues.length} quick fix${issues.length > 1 ? 'es' : ''} for your website` : 'your website check-up'}`,
          opening: `Hi, I help local businesses in ${ctx.city || 'your area'} keep their websites working. I ran a quick public check on ${name}.`,
          findings,
          offer: 'I can fix these this week for a fixed price and send you a before/after report you can re-run yourself.',
          closing: 'Happy to show you the checks on a 10-minute call.',
        },
      });
    },
  };
}
