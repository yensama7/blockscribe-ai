"""Reviewer matching: embed the submission abstract, search abstract-level
vectors of everyone's past work, exclude conflicted candidates, rank by
best-match score per candidate (restructure.md §5)."""

from typing import Any

from store.base import VectorStore


def match_reviewers(embedder, store: VectorStore, abstracts_col: str, *,
                    abstract: str, exclude_user_ids: list[str],
                    limit: int = 5) -> list[dict[str, Any]]:
    if not abstract or store.count(abstracts_col) == 0:
        return []
    vector = embedder.embed([abstract])[0]
    # over-fetch, then aggregate by uploader and drop conflicts
    hits = store.search(abstracts_col, vector, limit=limit * 10)
    excluded = set(exclude_user_ids)
    best: dict[str, dict[str, Any]] = {}
    for h in hits:
        uid = h.payload.get("uploader_id", "")
        if not uid or uid in excluded or h.score <= 0:
            continue
        if uid not in best or h.score > best[uid]["score"]:
            best[uid] = {
                "user_id": uid,
                "score": round(h.score, 4),
                "evidence_submission_id": h.payload.get("submission_id", ""),
            }
    ranked = sorted(best.values(), key=lambda r: r["score"], reverse=True)
    return ranked[:limit]
