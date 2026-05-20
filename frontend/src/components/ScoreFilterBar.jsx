export default function ScoreFilterBar({ filters, activeFilter, onSelect, loading }) {
  if (!filters) return null;

  return (
    <div className="score-filter-bar">
      <div className="filter-section">
        <h4>Below threshold</h4>
        <p className="filter-hint">Variations with score less than the value (for cleaning)</p>
        <div className="filter-chips">
          <button
            type="button"
            className={activeFilter?.key === 'all' ? 'chip active' : 'chip'}
            disabled={loading}
            onClick={() => onSelect({ key: 'all', mode: 'all' })}
          >
            All scores
          </button>
          {filters.below_thresholds.map((t) => {
            const key = `below-${t}`;
            return (
              <button
                key={key}
                type="button"
                className={activeFilter?.key === key ? 'chip active' : 'chip'}
                disabled={loading}
                onClick={() => onSelect({ key, mode: 'below', threshold: t })}
              >
                &lt; {t.toFixed(1)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-section">
        <h4>Score bands</h4>
        <p className="filter-hint">Original → variations within each band only</p>
        <div className="filter-chips">
          {filters.bands.map((band) => {
            const key = `band-${band.min}-${band.max}`;
            return (
              <button
                key={key}
                type="button"
                className={activeFilter?.key === key ? 'chip active' : 'chip'}
                disabled={loading}
                onClick={() =>
                  onSelect({
                    key,
                    mode: 'band',
                    band_min: band.min,
                    band_max: band.max,
                    label: band.label,
                  })
                }
              >
                {band.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
