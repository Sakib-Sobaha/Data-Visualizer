import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import TagsPage from './pages/TagsPage';
import SimilarityPage from './pages/SimilarityPage';
import ScoreReviewPage from './pages/ScoreReviewPage';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <h1>EC Dataset Visualizer</h1>
            <p className="subtitle">Clean evaluation variations · tag explorer · embedding scores</p>
          </div>
          <nav className="nav-tabs">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              Tags &amp; Variations
            </NavLink>
            <NavLink to="/similarity" className={({ isActive }) => (isActive ? 'active' : '')}>
              Embedding Scores
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => (isActive ? 'active' : '')}>
              Score Review
            </NavLink>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<TagsPage />} />
            <Route path="/similarity" element={<SimilarityPage />} />
            <Route path="/similarity/:tag" element={<SimilarityPage />} />
            <Route path="/review" element={<ScoreReviewPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
