export function scoreClass(score) {
  if (score >= 0.92) return 'score-high';
  if (score >= 0.85) return 'score-mid';
  return 'score-low';
}
