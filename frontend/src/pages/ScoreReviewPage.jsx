import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import GroupedSimilarityView from '../components/GroupedSimilarityView';
import ScoreFilterBar from '../components/ScoreFilterBar';
import { DEFAULT_SCORE_FILTERS } from '../constants/scoreFilters';

export default function ScoreReviewPage() {
  const [tags, setTags] = useState([]);
  const [scoreFilters, setScoreFilters] = useState(DEFAULT_SCORE_FILTERS);
  const [activeFilter, setActiveFilter] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setError('');
      try {
        const tagsRes = await api.tags({ sort_by: 'tag', order: 'asc' });
        setTags(tagsRes.tags.filter((t) => t.has_original));
      } catch (e) {
        setError(e.message);
      }
      const filtersRes = await api.scoreFilters();
      setScoreFilters(filtersRes);
    })();
  }, []);

  const runReview = useCallback(
    async (filter) => {
      if (filter.mode === 'all') {
        setError('Pick a score threshold or band to scan all tags.');
        return;
      }
      setActiveFilter(filter);
      setLoading(true);
      setError('');
      setResults([]);
      setProgress({ done: 0, total: tags.length, current: '' });

      const collected = [];
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i].tag;
        setProgress({ done: i, total: tags.length, current: tag });
        try {
          const params = { mode: filter.mode };
          if (filter.mode === 'below') params.threshold = filter.threshold;
          if (filter.mode === 'band') {
            params.band_min = filter.band_min;
            params.band_max = filter.band_max;
          }
          const res = await api.similarityGrouped(tag, params);
          if (res.total_matching_variations > 0) {
            collected.push(res);
          }
        } catch (e) {
          setError(`Failed on tag ${tag}: ${e.message}`);
          break;
        }
      }
      setProgress({ done: tags.length, total: tags.length, current: '' });
      setResults(collected);
      setLoading(false);
    },
    [tags],
  );

  const handleDelete = async (rowIndex) => {
    if (!window.confirm('Remove this variation from the evaluation CSV?')) return;
    try {
      await api.deleteVariation(rowIndex);
      if (activeFilter) await runReview(activeFilter);
    } catch (e) {
      setError(e.message);
    }
  };

  const totalMatches = results.reduce((s, r) => s + r.total_matching_variations, 0);

  return (
    <div className="page review-page">
      <section className="panel">
        <div className="panel-head">
          <h2>Dataset-wide score review</h2>
          <span className="badge">{tags.length} tags with originals</span>
        </div>
        <p className="muted">
          Select a threshold or band to scan every tag. Results are grouped: each original
          question, then its variations in that score range.
        </p>

        <ScoreFilterBar
          filters={scoreFilters}
          activeFilter={activeFilter}
          onSelect={runReview}
          loading={loading}
        />

        {loading && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
            <p className="muted">
              Processing {progress.done + 1} / {progress.total}: <code>{progress.current}</code>
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {!loading && results.length > 0 && (
          <>
            <div className="toolbar">
              <input
                type="search"
                className="full-width"
                placeholder="Search tag or question…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="badge ok">
                {results.length} tags · {totalMatches} variations
              </span>
            </div>
            <div className="review-results">
              {results
                .filter((r) => {
                  const q = search.toLowerCase();
                  if (!q) return true;
                  return (
                    r.tag.toLowerCase().includes(q) ||
                    r.groups.some(
                      (g) =>
                        g.original.toLowerCase().includes(q) ||
                        g.variations.some((v) => v.question.toLowerCase().includes(q)),
                    )
                  );
                })
                .map((tagResult) => (
                  <section key={tagResult.tag} className="tag-review-block">
                    <header className="tag-review-head">
                      <h3>{tagResult.tag}</h3>
                      <span className="badge">{tagResult.total_matching_variations} matches</span>
                      <span className="muted">{tagResult.filter_label}</span>
                    </header>
                    <GroupedSimilarityView
                      groups={tagResult.groups}
                      onDelete={handleDelete}
                    />
                  </section>
                ))}
            </div>
          </>
        )}

        {!loading && activeFilter && results.length === 0 && !error && (
          <p className="muted">No variations matched this filter across any tag.</p>
        )}
      </section>
    </div>
  );
}
