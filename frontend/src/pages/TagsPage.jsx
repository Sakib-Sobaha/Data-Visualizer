import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function TagsPage() {
  const [stats, setStats] = useState(null);
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [detail, setDetail] = useState(null);
  const [variations, setVariations] = useState([]);
  const [search, setSearch] = useState('');
  const [varSearch, setVarSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [varLoading, setVarLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statsRes, tagsRes, healthRes] = await Promise.all([
        api.stats(),
        api.tags({ search: search || undefined, sort_by: 'variation_count', order: 'desc' }),
        api.health(),
      ]);
      setStats(statsRes);
      setTags(tagsRes.tags);
      setHealth(healthRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const selectTag = async (tag) => {
    setSelectedTag(tag);
    setVarLoading(true);
    setError('');
    try {
      const [d, v] = await Promise.all([
        api.tagDetail(tag),
        api.variations(tag, { limit: 200, search: varSearch || undefined }),
      ]);
      setDetail(d);
      setVariations(v.variations);
    } catch (e) {
      setError(e.message);
    } finally {
      setVarLoading(false);
    }
  };

  const reloadVariations = async () => {
    if (!selectedTag) return;
    setVarLoading(true);
    try {
      const v = await api.variations(selectedTag, {
        limit: 200,
        search: varSearch || undefined,
      });
      setVariations(v.variations);
      const d = await api.tagDetail(selectedTag);
      setDetail(d);
      const tagsRes = await api.tags({ search: search || undefined });
      setTags(tagsRes.tags);
      const statsRes = await api.stats();
      setStats(statsRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setVarLoading(false);
    }
  };

  const handleDelete = async (rowIndex) => {
    if (!window.confirm('Remove this variation from the evaluation CSV?')) return;
    try {
      await api.deleteVariation(rowIndex);
      await reloadVariations();
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (selectedTag) selectTag(selectedTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varSearch]);

  return (
    <div className="page grid-two">
      <section className="panel">
        <div className="panel-head">
          <h2>Dataset overview</h2>
          {health && (
            <span className={`badge ${health.ec_bot_reachable ? 'ok' : 'warn'}`}>
              EC Bot: {health.ec_bot_reachable ? 'connected' : 'offline'}
            </span>
          )}
        </div>
        {stats && (
          <div className="stats-grid">
            <Stat label="Total variations" value={stats.total_variations} />
            <Stat label="Tags in eval" value={stats.unique_tags_in_eval} />
            <Stat label="Original rows" value={stats.total_original_rows} />
            <Stat label="Avg / tag" value={stats.avg_variations_per_tag} />
          </div>
        )}
        <div className="toolbar">
          <input
            type="search"
            placeholder="Filter tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="primary" onClick={loadTags}>
            Refresh
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">Loading tags…</p>
        ) : (
          <ul className="tag-list">
            {tags.map((t) => (
              <li key={t.tag}>
                <button
                  type="button"
                  className={selectedTag === t.tag ? 'selected' : ''}
                  onClick={() => selectTag(t.tag)}
                >
                  <span className="tag-name">{t.tag}</span>
                  <span className="tag-meta">
                    {t.variation_count} variations
                    {!t.has_original && ' · no original'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel detail-panel">
        {!selectedTag ? (
          <p className="muted">Select a tag to view originals and variations.</p>
        ) : varLoading && !detail ? (
          <p className="muted">Loading…</p>
        ) : detail ? (
          <>
            <div className="panel-head">
              <h2>{detail.tag}</h2>
              <span className="badge">{detail.variation_count} variations</span>
              <Link className="link-btn" to={`/similarity/${encodeURIComponent(detail.tag)}`}>
                View embedding scores →
              </Link>
            </div>
            <div className="original-block">
              <h3>Original question(s)</h3>
              {detail.original_questions?.length ? (
                <ol>
                  {detail.original_questions.map((q, i) => (
                    <li key={i} className="bengali">
                      {q}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="warn">No original in original_queries.csv for this tag.</p>
              )}
            </div>
            <div className="toolbar">
              <input
                type="search"
                placeholder="Search variations…"
                value={varSearch}
                onChange={(e) => setVarSearch(e.target.value)}
              />
            </div>
            <ul className="variation-list">
              {variations.map((v) => (
                <li key={v.row_index}>
                  <p className="bengali">{v.question}</p>
                  <div className="row-actions">
                    <span className="muted">row #{v.row_index}</span>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDelete(v.row_index)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
