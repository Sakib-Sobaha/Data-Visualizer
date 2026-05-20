"""
Dataset visualizer API — serves evaluation CSV data and proxies embedding
similarity to the EC FAQ bot (ec-faq-bot) service.
"""

from __future__ import annotations

import csv
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATASET_DIR = Path(os.getenv("DATASET_DIR", ROOT / "Dataset"))
EVAL_CSV = Path(os.getenv("EVAL_CSV", DATASET_DIR / "new_dataset_2026-01-26_test_old.csv"))
ORIGINAL_CSV = Path(os.getenv("ORIGINAL_CSV", DATASET_DIR / "original_queries.csv"))
EC_BOT_URL = os.getenv("EC_BOT_URL", "http://127.0.0.1:8000").rstrip("/")
SIMILARITY_BATCH_SIZE = int(os.getenv("SIMILARITY_BATCH_SIZE", "64"))
SCORE_STEP = float(os.getenv("SCORE_STEP", "0.1"))
MIN_SCORE_FLOOR = float(os.getenv("MIN_SCORE_FLOOR", "0.1"))

app = FastAPI(title="Dataset Visualizer API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DeleteVariationRequest(BaseModel):
    row_index: int = Field(..., ge=0, description="0-based row index in the evaluation CSV (excluding header)")


def _load_eval_df() -> pd.DataFrame:
    if not EVAL_CSV.exists():
        raise HTTPException(status_code=500, detail=f"Evaluation CSV not found: {EVAL_CSV}")
    return pd.read_csv(EVAL_CSV, encoding="utf-8")


def _load_original_df() -> pd.DataFrame:
    if not ORIGINAL_CSV.exists():
        raise HTTPException(status_code=500, detail=f"Original queries CSV not found: {ORIGINAL_CSV}")
    return pd.read_csv(ORIGINAL_CSV, encoding="utf-8")


def _originals_by_tag(df: pd.DataFrame) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for _, row in df.iterrows():
        tag = str(row["tag"]).strip()
        q = str(row["question"]).strip()
        if tag and q:
            grouped[tag].append(q)
    return dict(grouped)


def _write_eval_df(df: pd.DataFrame) -> None:
    df.to_csv(EVAL_CSV, index=False, encoding="utf-8", quoting=csv.QUOTE_MINIMAL)


def _score_bands_config() -> dict[str, Any]:
    """0.1-step bands from 1.0 down to MIN_SCORE_FLOOR."""
    below_thresholds: list[float] = []
    t = 1.0 - SCORE_STEP
    while t >= MIN_SCORE_FLOOR - 1e-9:
        below_thresholds.append(round(t, 2))
        t -= SCORE_STEP

    bands: list[dict[str, float | str]] = []
    upper = 1.0
    lower = round(upper - SCORE_STEP, 2)
    while lower >= MIN_SCORE_FLOOR - 1e-9:
        bands.append({
            "label": f"{lower:.1f} – {upper:.1f}",
            "min": lower,
            "max": upper,
        })
        upper = lower
        lower = round(upper - SCORE_STEP, 2)
    bands.append({
        "label": f"0.0 – {upper:.1f}",
        "min": 0.0,
        "max": upper,
    })
    return {"below_thresholds": below_thresholds, "bands": bands}


def _score_matches_filter(
    score: float,
    mode: str,
    *,
    threshold: float | None = None,
    band_min: float | None = None,
    band_max: float | None = None,
) -> bool:
    if mode == "all":
        return True
    if mode == "below":
        if threshold is None:
            return True
        return score < threshold
    if mode == "band":
        if band_min is None or band_max is None:
            return True
        if band_max >= 1.0:
            return band_min <= score <= band_max
        return band_min <= score < band_max
    return True


async def _fetch_similarity_scores(reference: str, candidates: list[str]) -> list[float]:
    if not candidates:
        return []
    all_scores: list[float] = []
    async with httpx.AsyncClient(timeout=300.0) as client:
        for start in range(0, len(candidates), SIMILARITY_BATCH_SIZE):
            batch = candidates[start : start + SIMILARITY_BATCH_SIZE]
            resp = await client.post(
                f"{EC_BOT_URL}/ec_bot/similarity_batch/",
                json={"reference": reference, "candidates": batch},
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise HTTPException(status_code=502, detail=data["error"])
            all_scores.extend(data.get("cosine_similarities", []))
    return all_scores


@app.get("/")
def read_root():
    return {
        "message": "Dataset Visualizer API",
        "eval_csv": str(EVAL_CSV),
        "original_csv": str(ORIGINAL_CSV),
        "ec_bot_url": EC_BOT_URL,
    }


@app.get("/api/health")
async def health():
    ec_bot_ok = False
    ec_bot_message = ""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{EC_BOT_URL}/")
            ec_bot_ok = r.status_code == 200
            ec_bot_message = r.json().get("message", "ok")
    except Exception as e:
        ec_bot_message = str(e)
    return {
        "status": "ok",
        "ec_bot_reachable": ec_bot_ok,
        "ec_bot_message": ec_bot_message,
        "ec_bot_url": EC_BOT_URL,
    }


@app.get("/api/stats")
def dataset_stats():
    eval_df = _load_eval_df()
    orig_df = _load_original_df()
    tag_counts = eval_df.groupby("tag").size().to_dict()
    eval_tags = set(eval_df["tag"].astype(str))
    orig_tags = set(orig_df["tag"].astype(str))
    return {
        "total_variations": int(len(eval_df)),
        "unique_tags_in_eval": int(eval_df["tag"].nunique()),
        "total_original_rows": int(len(orig_df)),
        "unique_tags_in_original": int(orig_df["tag"].nunique()),
        "tags_with_variations_but_no_original": sorted(eval_tags - orig_tags),
        "tags_with_original_but_no_variations": sorted(orig_tags - eval_tags),
        "avg_variations_per_tag": round(len(eval_df) / max(eval_df["tag"].nunique(), 1), 2),
        "max_variations_for_tag": max(tag_counts.values()) if tag_counts else 0,
        "min_variations_for_tag": min(tag_counts.values()) if tag_counts else 0,
    }


@app.get("/api/tags")
def list_tags(
    search: str | None = Query(None, description="Filter tags by substring"),
    sort_by: str = Query("variation_count", pattern="^(tag|variation_count)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    eval_df = _load_eval_df()
    orig_map = _originals_by_tag(_load_original_df())
    counts = eval_df.groupby("tag").size()

    items = []
    for tag, count in counts.items():
        tag_str = str(tag)
        if search and search.lower() not in tag_str.lower():
            continue
        originals = orig_map.get(tag_str, [])
        items.append({
            "tag": tag_str,
            "variation_count": int(count),
            "has_original": bool(originals),
            "original_count": len(originals),
            "primary_original": originals[0] if originals else None,
        })

    reverse = order == "desc"
    if sort_by == "tag":
        items.sort(key=lambda x: x["tag"], reverse=reverse)
    else:
        items.sort(key=lambda x: x["variation_count"], reverse=reverse)

    return {"tags": items, "total": len(items)}


@app.get("/api/tags/{tag}")
def get_tag_detail(tag: str):
    eval_df = _load_eval_df()
    subset = eval_df[eval_df["tag"].astype(str) == tag]
    if subset.empty:
        raise HTTPException(status_code=404, detail=f"Tag not found in evaluation dataset: {tag}")

    orig_map = _originals_by_tag(_load_original_df())
    originals = orig_map.get(tag, [])

    return {
        "tag": tag,
        "variation_count": int(len(subset)),
        "original_questions": originals,
        "has_original": bool(originals),
        "sample_variations": subset["question"].head(5).tolist(),
    }


@app.get("/api/tags/{tag}/variations")
def get_tag_variations(
    tag: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str | None = None,
):
    eval_df = _load_eval_df()
    subset = eval_df[eval_df["tag"].astype(str) == tag].reset_index(drop=True)
    if subset.empty:
        raise HTTPException(status_code=404, detail=f"Tag not found: {tag}")

    if search:
        mask = subset["question"].astype(str).str.contains(search, case=False, na=False)
        subset = subset[mask].reset_index(drop=True)

    full_eval = _load_eval_df()
    tag_mask = full_eval["tag"].astype(str) == tag
    q_to_global = {
        str(q): int(idx)
        for idx, q in zip(full_eval.index[tag_mask], full_eval.loc[tag_mask, "question"])
    }

    total = len(subset)
    page = subset.iloc[offset : offset + limit]
    rows = [
        {
            "row_index": q_to_global.get(str(row["question"]), -1),
            "question": str(row["question"]),
            "tag": tag,
        }
        for _, row in page.iterrows()
    ]

    return {"tag": tag, "total": total, "offset": offset, "limit": limit, "variations": rows}


@app.get("/api/score-filters")
def get_score_filters():
    """Preset below-threshold and score-band filters for the review UI."""
    return _score_bands_config()


@app.get("/api/tags/{tag}/similarity-grouped")
async def get_tag_similarity_grouped(
    tag: str,
    mode: str = Query("below", pattern="^(below|band|all)$"),
    threshold: float | None = Query(None, ge=0.0, le=1.0),
    band_min: float | None = Query(None, ge=0.0, le=1.0),
    band_max: float | None = Query(None, ge=0.0, le=1.0),
):
    """
    For each original question of the tag, score all variations and return
    those matching the filter (below threshold or within a score band).
  """
    eval_df = _load_eval_df()
    subset = eval_df[eval_df["tag"].astype(str) == tag]
    if subset.empty:
        raise HTTPException(status_code=404, detail=f"Tag not found: {tag}")

    orig_map = _originals_by_tag(_load_original_df())
    originals = orig_map.get(tag, [])
    if not originals:
        raise HTTPException(
            status_code=404,
            detail=f"No original question for tag '{tag}' in {ORIGINAL_CSV.name}",
        )

    if mode == "below" and threshold is None:
        raise HTTPException(status_code=400, detail="threshold is required for mode=below")
    if mode == "band" and (band_min is None or band_max is None):
        raise HTTPException(status_code=400, detail="band_min and band_max are required for mode=band")

    questions = subset["question"].astype(str).tolist()
    global_indices = [int(i) for i in subset.index.tolist()]

    groups: list[dict[str, Any]] = []
    total_matching = 0

    try:
        for orig_idx, reference in enumerate(originals):
            scores = await _fetch_similarity_scores(reference, questions)
            variations: list[dict[str, Any]] = []
            for row_index, question, score in zip(global_indices, questions, scores):
                if _score_matches_filter(
                    score, mode, threshold=threshold, band_min=band_min, band_max=band_max,
                ):
                    variations.append({
                        "row_index": row_index,
                        "question": question,
                        "cosine_similarity": score,
                    })
            variations.sort(key=lambda x: x["cosine_similarity"])
            total_matching += len(variations)
            groups.append({
                "original_index": orig_idx,
                "original": reference,
                "variation_count": len(variations),
                "variations": variations,
            })
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EC bot similarity request failed ({EC_BOT_URL}): {e}",
        ) from e

    filter_label = "all variations"
    if mode == "below":
        filter_label = f"score < {threshold:.2f}"
    elif mode == "band":
        filter_label = f"{band_min:.2f} ≤ score ≤ {band_max:.2f}" if (band_max or 0) >= 1.0 else f"{band_min:.2f} ≤ score < {band_max:.2f}"

    return {
        "tag": tag,
        "mode": mode,
        "threshold": threshold,
        "band_min": band_min,
        "band_max": band_max,
        "filter_label": filter_label,
        "total_variations": len(questions),
        "total_matching_variations": total_matching,
        "groups": groups,
    }


@app.get("/api/tags/{tag}/similarity")
async def get_tag_similarity(
    tag: str,
    reference_index: int = Query(0, ge=0, description="Which original question to use as reference"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    eval_df = _load_eval_df()
    subset = eval_df[eval_df["tag"].astype(str) == tag]
    if subset.empty:
        raise HTTPException(status_code=404, detail=f"Tag not found: {tag}")

    orig_map = _originals_by_tag(_load_original_df())
    originals = orig_map.get(tag, [])
    if not originals:
        raise HTTPException(
            status_code=404,
            detail=f"No original question for tag '{tag}' in {ORIGINAL_CSV.name}",
        )
    if reference_index >= len(originals):
        raise HTTPException(status_code=400, detail=f"reference_index must be < {len(originals)}")

    reference = originals[reference_index]
    questions = subset["question"].astype(str).tolist()
    global_indices = subset.index.tolist()

    total = len(questions)
    slice_questions = questions[offset : offset + limit]
    slice_indices = global_indices[offset : offset + limit]

    try:
        scores = await _fetch_similarity_scores(reference, slice_questions)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"EC bot similarity request failed ({EC_BOT_URL}): {e}",
        ) from e

    items = []
    for row_index, question, score in zip(slice_indices, slice_questions, scores):
        items.append({
            "row_index": int(row_index),
            "question": question,
            "cosine_similarity": score,
        })
    items.sort(key=lambda x: x["cosine_similarity"], reverse=True)

    return {
        "tag": tag,
        "reference": reference,
        "reference_index": reference_index,
        "all_originals": originals,
        "variation_count": total,
        "offset": offset,
        "limit": limit,
        "items": items,
    }


@app.delete("/api/variations")
def delete_variation(body: DeleteVariationRequest):
    df = _load_eval_df()
    if body.row_index < 0 or body.row_index >= len(df):
        raise HTTPException(status_code=404, detail=f"Invalid row_index: {body.row_index}")

    removed = df.iloc[body.row_index].to_dict()
    df = df.drop(index=body.row_index).reset_index(drop=True)
    _write_eval_df(df)

    return {
        "deleted": True,
        "removed": {
            "row_index": body.row_index,
            "question": str(removed.get("question", "")),
            "tag": str(removed.get("tag", "")),
        },
        "remaining_rows": len(df),
    }
