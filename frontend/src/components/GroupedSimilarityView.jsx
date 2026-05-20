import { scoreClass } from '../utils/score';

export default function GroupedSimilarityView({ groups, filterLabel, onDelete }) {
  if (!groups?.length) {
    return <p className="muted">No original questions for this tag.</p>;
  }

  const hasAny = groups.some((g) => g.variations?.length > 0);

  return (
    <div className="grouped-review">
      {filterLabel && (
        <p className="filter-caption">
          Showing variations where <strong>{filterLabel}</strong>
        </p>
      )}
      {!hasAny && <p className="muted">No variations match this filter for any original.</p>}
      {groups.map((group) => (
        <article key={group.original_index} className="original-group">
          <header className="original-group-head">
            <span className="original-badge">Original {group.original_index + 1}</span>
            <span className="badge">{group.variation_count} in range</span>
          </header>
          <p className="bengali original-group-text">{group.original}</p>
          {group.variations?.length === 0 ? (
            <p className="muted small-indent">No variations in this score range.</p>
          ) : (
            <ul className="grouped-variation-list">
              {group.variations.map((v) => (
                <li key={`${group.original_index}-${v.row_index}`}>
                  <span className={`score-pill ${scoreClass(v.cosine_similarity)}`}>
                    {v.cosine_similarity.toFixed(4)}
                  </span>
                  <p className="bengali">{v.question}</p>
                  <div className="row-actions">
                    <span className="muted">row #{v.row_index}</span>
                    <button
                      type="button"
                      className="danger small"
                      onClick={() => onDelete(v.row_index)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}
