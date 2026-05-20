/** Client-side fallback when /api/score-filters is unavailable (stale backend). */
export const DEFAULT_SCORE_FILTERS = {
  below_thresholds: [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
  bands: [
    { label: '0.9 – 1.0', min: 0.9, max: 1.0 },
    { label: '0.8 – 0.9', min: 0.8, max: 0.9 },
    { label: '0.7 – 0.8', min: 0.7, max: 0.8 },
    { label: '0.6 – 0.7', min: 0.6, max: 0.7 },
    { label: '0.5 – 0.6', min: 0.5, max: 0.6 },
    { label: '0.4 – 0.5', min: 0.4, max: 0.5 },
    { label: '0.3 – 0.4', min: 0.3, max: 0.4 },
    { label: '0.2 – 0.3', min: 0.2, max: 0.3 },
    { label: '0.1 – 0.2', min: 0.1, max: 0.2 },
    { label: '0.0 – 0.1', min: 0.0, max: 0.1 },
  ],
};
