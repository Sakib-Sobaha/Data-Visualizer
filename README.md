# EC Dataset Visualizer

A web dashboard for **cleaning and reviewing** the EC FAQ bot evaluation dataset. It lets you browse tags, compare generated question variations against canonical originals, filter by **E5 embedding cosine similarity**, and delete low-quality rows directly from the CSV.

## What it does

The tool reads two CSV files under `Dataset/`, joins them by `tag`, and helps you decide which variation rows to keep or remove before training or evaluation.

| File | Role |
|------|------|
| [`Dataset/original_queries.csv`](Dataset/original_queries.csv) | Canonical **original questions** per tag (`question`, `tag`). Used as the reference text when computing embedding similarity. A tag may have more than one original row. |
| [`Dataset/new_dataset_2026-01-26_test_old.csv`](Dataset/new_dataset_2026-01-26_test_old.csv) | **Evaluation dataset** of paraphrased variations (`question`, `tag`) to review and clean. Deletes from the UI update this file in place. |

**Typical workflow**

1. Pick a **tag** and see its original question(s) plus all variations from the evaluation CSV.
2. On **Embedding Scores**, compute **cosine similarity** between each variation and each original (via the EC FAQ bot E5 model). Variations far from the original are candidates for removal.
3. Use **score filters** (e.g. below 0.9, 0.8, or bands like 0.8–0.9) to list originals and matching variations in grouped sections.
4. **Delete** bad variations; the row is removed from `new_dataset_2026-01-26_test_old.csv`.

Embedding scores are **not** computed inside this repo. [`main.py`](main.py) calls the EC FAQ bot service ([`/data/ec-faq-bot`](../ec-faq-bot) or your install) endpoint `POST /ec_bot/similarity_batch/`, which uses the same E5 STS encoding as production search (original = passage, variation = query).

## Project layout

```
Data-Visualizer/
├── main.py                 # FastAPI backend (dataset CRUD + similarity proxy)
├── requirements.txt        # Python dependencies
├── docs/
│   └── images/             # Screenshots & diagrams for README (you add files here)
├── Dataset/
│   ├── original_queries.csv
│   └── new_dataset_2026-01-26_test_old.csv
└── frontend/               # Vite + React UI
    ├── src/
    │   ├── pages/
    │   │   ├── TagsPage.jsx          # Browse tags, originals, variations, delete
    │   │   ├── SimilarityPage.jsx    # Per-tag embedding scores + filters
    │   │   └── ScoreReviewPage.jsx   # Dataset-wide scan by score threshold
    │   └── api.js                    # API client (proxied to :8002 in dev)
    └── vite.config.js                # Dev server + /api → :8002 proxy
```

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** (for the frontend)
- **EC FAQ bot** running with the embedding model loaded ([`ec-faq-bot`](https://github.com/Sakib-Sobaha/ec-faq-bot) or `/data/ec-faq-bot`)

## Setup

### 1. EC FAQ bot (embeddings) — port **8000**

```bash
cd /data/ec-faq-bot   # or your clone path
source .venv-ec/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

Verify: `curl http://127.0.0.1:8000/` → `{"message":"Welcome to EC Bot API!"}`

### 2. Visualizer API — port **8002**

```bash
cd /home/sitazureuser/Data-Visualizer
python3 -m pip install -r requirements.txt

EC_BOT_URL=http://127.0.0.1:8000 uvicorn main:app --host 0.0.0.0 --port 8002
```

Verify: `curl http://127.0.0.1:8002/api/stats`

> **Important:** Port **8002** must run **this** project's `main.py`, not the EC bot. The EC bot should use **8000** only.

### 3. Frontend — port **5173**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** (Vite proxies `/api` to `http://127.0.0.1:8002`).

Production build:

```bash
cd frontend
npm run build
npm run preview
```

## UI pages

| Page | Path | Description |
|------|------|-------------|
| **Tags & Variations** | `/` | Dataset stats, tag list, original questions from `original_queries.csv`, variations from `new_dataset_2026-01-26_test_old.csv`, delete rows. |
| **Embedding Scores** | `/similarity` | Per-tag cosine similarity vs originals; filters **&lt; 0.9**, **&lt; 0.8**, … and bands **0.9–1.0**, **0.8–0.9**, …; grouped original → variations. |
| **Score Review** | `/review` | Run the same filters across **all tags** (slower; shows progress while scoring). |

## Screenshots & images

Store image files under [`docs/images/`](docs/images/) (see [`docs/images/README.md`](docs/images/README.md) for a quick reference).

Embed them in this README with relative paths, for example:

```markdown
![Tags & Variations](docs/images/tags-variations.png)
![Embedding scores](docs/images/embedding-scores.png)
```

Add your own files next to the placeholders above; GitHub will render them on the repository home page.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EC_BOT_URL` | `http://127.0.0.1:8000` | EC FAQ bot base URL for `/ec_bot/similarity_batch/` |
| `DATASET_DIR` | `./Dataset` | Directory containing the CSV files |
| `EVAL_CSV` | `Dataset/new_dataset_2026-01-26_test_old.csv` | Evaluation variations file |
| `ORIGINAL_CSV` | `Dataset/original_queries.csv` | Original questions file |
| `SIMILARITY_BATCH_SIZE` | `64` | Batch size for embedding API calls |
| `SCORE_STEP` | `0.1` | Step for threshold/band buttons (0.9, 0.8, …) |

Example:

```bash
EC_BOT_URL=http://127.0.0.1:8000 \
EVAL_CSV=/path/to/my_eval.csv \
ORIGINAL_CSV=/path/to/my_originals.csv \
uvicorn main:app --host 0.0.0.0 --port 8002
```

## API overview

| Endpoint | Purpose |
|----------|---------|
| `GET /api/stats` | Row/tag counts for both CSVs |
| `GET /api/tags` | Tags with variation counts and original metadata |
| `GET /api/tags/{tag}` | Originals + sample variations for one tag |
| `GET /api/tags/{tag}/variations` | Paginated variations |
| `GET /api/tags/{tag}/similarity` | Flat similarity list (primary original) |
| `GET /api/tags/{tag}/similarity-grouped` | Original → variations, with score filter |
| `GET /api/score-filters` | Threshold and band presets for the UI |
| `DELETE /api/variations` | Remove a row from the evaluation CSV by `row_index` |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ECONNREFUSED 127.0.0.1:8002` | Start the visualizer API (`uvicorn main:app --port 8002`). |
| `403` / empty tags / `Not Found` on score filters | Restart the visualizer after pulling changes so `/api/score-filters` exists. |
| Embedding errors | Ensure EC bot is up on `EC_BOT_URL` (default 8000) and the model has finished loading. |
| Deletes not persisting | Check write permissions on `Dataset/new_dataset_2026-01-26_test_old.csv`. |

## License

See [LICENSE](LICENSE).
