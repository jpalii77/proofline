// The accuracy shown on the landing page. It must match docs/accuracy.md (a test checks it): the
// last four fresh lists, i.e. businesses the fixes were never made for, kept claims checked by hand.
export const ACCURACY = {
  rounds: [14, 16, 18, 19],
  kept: 109,
  total: 114,
  url: 'https://github.com/jpalii77/proofline/blob/main/docs/accuracy.md#results',
};

export const accuracyPct = (a) => Math.round((100 * a.kept) / a.total);
