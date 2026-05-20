import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import GroupedSimilarityView from '../components/GroupedSimilarityView';
import ScoreFilterBar from '../components/ScoreFilterBar';
import { DEFAULT_SCORE_FILTERS } from '../constants/scoreFilters';
import { scoreClass } from '../utils/score';

export default function SimilarityPage() {
  const { tag: routeTag } = useParams();
  const navigate = useNavigate();
  const [allTags, setAllTags] = useState([]);
  const [tagFilter, setTagFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState(routeTag || '');
  const [scoreFilters, setScoreFilters] = useState(DEFAULT_SCORE_FILTERS);
  const [activeFilter, setActiveFilter] = useState({ key: 'all', mode: 'all' });
  const [tableData, setTableData] = useState(null);
  const [groupedData, setGroupedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadTags = useCallback(async () => {
    setError('');
    try {
      const tagsRes = await api.tags({ sort_by: 'variation_count', order: 'desc' });
      setAllTags(tagsRes.tags.filter((t) => t.has_original));
    } catch (e) {
      setError(e.message);
    }
    try {
      const filtersRes = await api.scoreFilters();
      setScoreFilters(filtersRes);
    } catch {
      /* api.scoreFilters already falls back */
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (routeTag) setSelectedTag(routeTag);
  }, [routeTag]);

  const tags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [allTags, tagFilter]);

  const loadScores = useCallback(async () => {
    if (!selectedTag) return;
    setLoading(true);
    setError('');
    setTableData(null);
    setGroupedData(null);
    try {
      if (activeFilter.mode === 'all') {
        const res = await api.similarity(selectedTag, { limit: 500 });
        setTableData(res);
      } else {
        const params = { mode: activeFilter.mode };
        if (activeFilter.mode === 'below') params.threshold = activeFilter.threshold;
        if (activeFilter.mode === 'band') {
          params.band_min = activeFilter.band_min;
          params.band_max = activeFilter.band_max;
        }
        const res = await api.similarityGrouped(selectedTag, params);
        setGroupedData(res);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedTag, activeFilter]);

  useEffect(() => {
    if (selectedTag) loadScores();
  }, [selectedTag, activeFilter, loadScores]);

  const onSelectTag = (tag) => {
    setSelectedTag(tag);
    navigate(tag ? `/similarity/${encodeURIComponent(tag)}` : '/similarity');
  };

  const handleDelete = async (rowIndex) => {
    if (!window.confirm('Remove this variation from the evaluation CSV?')) return;
    try {
      await api.deleteVariation(rowIndex);
      await loadScores();
      await loadTags();
    } catch (e) {
      setError(e.message);
    }
  };

  const filteredTableItems =
    tableData?.items?.filter((item) => {
      return !search || item.question.toLowerCase().includes(search.toLowerCase());
    }) ?? [];

  return (
    <div className="page similarity-page">
      <section className="panel sidebar-narrow">
        <h2>Tags (with original)</h2>
        <input
          type="search"
          className="full-width"
          placeholder="Filter tag name…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <ul className="tag-list compact">
          {tags.map((t) => (
            <li key={t.tag}>
              <button
                type="button"
                className={selectedTag === t.tag ? 'selected' : ''}
                onClick={() => onSelectTag(t.tag)}
              >
                <span className="tag-name">{t.tag}</span>
                <span className="tag-meta">{t.variation_count}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel flex-grow">
        {!selectedTag ? (
          <p className="muted">Choose a tag to compare variations against original question(s).</p>
        ) : (
          <>
            <div className="panel-head">
              <h2>{selectedTag}</h2>
              {(tableData || groupedData) && (
                <span className="badge">
                  {groupedData?.total_matching_variations ?? tableData?.variation_count} shown
                </span>
              )}
              <button type="button" className="primary" onClick={loadScores} disabled={loading}>
                {loading ? 'Scoring…' : 'Recompute'}
              </button>
            </div>

            <ScoreFilterBar
              filters={scoreFilters}
              activeFilter={activeFilter}
              onSelect={setActiveFilter}
              loading={loading}
            />

            {error && <p className="error">{error}</p>}

            {activeFilter.mode !== 'all' && (
              <div className="toolbar">
                <input
                  type="search"
                  placeholder="Search variation text…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {loading && (
              <p className="muted">Computing E5 cosine similarities via EC bot…</p>
            )}

            {!loading && groupedData && (
              <GroupedSimilarityView
                groups={groupedData.groups.map((g) => ({
                  ...g,
                  variations: g.variations.filter(
                    (v) =>
                      !search || v.question.toLowerCase().includes(search.toLowerCase()),
                  ),
                }))}
                filterLabel={groupedData.filter_label}
                onDelete={handleDelete}
              />
            )}

            {!loading && tableData && activeFilter.mode === 'all' && (
              <>
                <div className="reference-section">
                  <h3>Reference (primary original)</h3>
                  <p className="bengali reference-text">{tableData.reference}</p>
                  {tableData.all_originals?.length > 1 && (
                    <p className="muted">
                      This tag has {tableData.all_originals.length} originals — use a score
                      filter below to see each original with its matching variations.
                    </p>
                  )}
                </div>
                <div className="toolbar">
                  <input
                    type="search"
                    placeholder="Search variation text…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>Score</th>
                      <th>Variation</th>
                      <th>Row</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTableItems.map((item) => (
                      <tr key={item.row_index}>
                        <td>
                          <span className={`score-pill ${scoreClass(item.cosine_similarity)}`}>
                            {item.cosine_similarity.toFixed(4)}
                          </span>
                        </td>
                        <td className="bengali">{item.question}</td>
                        <td className="muted">#{item.row_index}</td>
                        <td>
                          <button
                            type="button"
                            className="danger small"
                            onClick={() => handleDelete(item.row_index)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
