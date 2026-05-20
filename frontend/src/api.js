import { DEFAULT_SCORE_FILTERS } from './constants/scoreFilters';

const API_BASE = import.meta.env.VITE_API_URL || '';

function toQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      q.set(key, String(value));
    }
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      : detail || data.error || res.statusText;
    throw new Error(typeof msg === 'string' ? msg : res.statusText);
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  stats: () => request('/api/stats'),
  tags: (params = {}) => request(`/api/tags${toQuery(params)}`),
  tagDetail: (tag) => request(`/api/tags/${encodeURIComponent(tag)}`),
  variations: (tag, params = {}) =>
    request(`/api/tags/${encodeURIComponent(tag)}/variations${toQuery(params)}`),
  similarity: (tag, params = {}) =>
    request(`/api/tags/${encodeURIComponent(tag)}/similarity${toQuery(params)}`),
  scoreFilters: async () => {
    try {
      return await request('/api/score-filters');
    } catch {
      return DEFAULT_SCORE_FILTERS;
    }
  },
  similarityGrouped: async (tag, params = {}) => {
    try {
      return await request(
        `/api/tags/${encodeURIComponent(tag)}/similarity-grouped${toQuery(params)}`,
      );
    } catch (e) {
      if (String(e.message).toLowerCase().includes('not found')) {
        throw new Error(
          'Score filter API not available — restart the visualizer backend: uvicorn main:app --port 8002',
        );
      }
      throw e;
    }
  },
  deleteVariation: (rowIndex) =>
    request('/api/variations', {
      method: 'DELETE',
      body: JSON.stringify({ row_index: rowIndex }),
    }),
};
