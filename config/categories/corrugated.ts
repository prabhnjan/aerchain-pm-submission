// Category config: everything category-specific lives here, so a new category is a new file.
export const CORRUGATED = {
  id: "corrugated",
  name: "Corrugated packaging",
  /** Finished-box price per kg a buyer would find plausible (research/domain-corrugated.md: ₹52–60 FMCG, ₹30–55 small converters). */
  plausibleInrPerKg: [30, 90] as [number, number],
  typicalInrPerKg: 55,
  /** Cross-vendor outlier thresholds vs the median of other plausible quotes. */
  outlierHigh: 1.18,
  outlierLow: 0.8,
};
