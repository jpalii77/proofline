// Host-side limits: things that stop a check from running that say nothing about the business.
//
//   - the per-run outbound request budget (src/io/net-worker.mjs, Workers free plan: 50 per request)
//   - Cloudflare's own "Too many subrequests" error, should the budget ever be miscounted
//   - the run's wall-clock deadline (withDeadline below)
//
// Any of these turns a check into "not checked" (pass: null). The gate treats null as "not proven",
// so a claim that depends on it is dropped: running out of time can never become "site is down".

export const DEADLINE_ERROR = 'not checked: run time limit reached';

const HOST_LIMIT = /request budget|run time limit|too many subrequests|subrequest limit|exceeded (its )?(cpu|resource)|worker exceeded/i;

/** Did this error come from our own host's limits rather than from the business's website? */
export function isHostLimit(message) {
  return HOST_LIMIT.test(String(message || ''));
}

/**
 * Wraps an I/O object so that, once `deadlineAt` has passed, every call answers with a clear
 * "not checked" error instead of touching the network. Calls already in flight are left alone.
 */
export function withDeadline(io, deadlineAt, now = () => Date.now()) {
  if (!deadlineAt) return io;
  const late = () => now() >= deadlineAt;
  return {
    ...io,
    async dnsLookup(...a) { return late() ? { a: [], aaaa: [], error: DEADLINE_ERROR } : io.dnsLookup(...a); },
    async fetchPage(url, ...a) { return late() ? { status: null, finalUrl: url, chain: [], error: DEADLINE_ERROR } : io.fetchPage(url, ...a); },
    async tlsCert(...a) { return late() ? { error: DEADLINE_ERROR } : io.tlsCert(...a); },
    async nominatim(...a) { return late() ? { error: DEADLINE_ERROR } : io.nominatim(...a); },
    async search(...a) { return late() ? { error: DEADLINE_ERROR } : io.search(...a); },
  };
}

/** A user-facing sentence for an error that escaped to the top of a request. Never a stack trace. */
export function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/too many subrequests|subrequest/i.test(msg)) return 'This run reached the demo host’s request limit. Checks that could not run count as “not checked”, never as findings. Try again, or pick a recorded example.';
  if (/cpu|exceeded|resource limit/i.test(msg)) return 'The demo host stopped this run early (time limit). Nothing unproven was claimed. Try again, or pick a recorded example.';
  if (/Token Factory HTTP 429|rate.?limit/i.test(msg)) return 'The model service is busy right now. Try again in a minute, or pick a recorded example.';
  if (/Token Factory/i.test(msg)) return 'The model service did not answer. Try again in a minute, or pick a recorded example.';
  return 'Something went wrong on our side. Try again, or pick a recorded example.';
}
