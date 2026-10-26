// The accuracy shown on the landing page. It must match docs/accuracy.md (a test checks it): the
// last four fresh lists, i.e. businesses the fixes were never made for, kept claims checked by hand.
export const ACCURACY = {
  rounds: [14, 16, 18, 19],
  kept: 109,
  total: 114,
  // the measurement page on the demo itself; it lists every round and every claim (public/proof.html)
  url: '/proof',
};

export const accuracyPct = (a) => Math.round((100 * a.kept) / a.total);
