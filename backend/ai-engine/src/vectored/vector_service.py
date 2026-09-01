"""FastAPI surface for the vector layer.

The index is a cache: the source of truth is IPFS plus the chain, and
/rebuild can repopulate everything from scratch (restructure.md §5)."""

from typing import Any

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

from config import collection_name, get_embedder, get_store
from matching import match_reviewers
from similarity import (ABSTRACTS, CHUNKS, ingest_version, related_versions,
                        run_similarity, semantic_search)

app = FastAPI(title="Blockscribe vector service")

embedder = get_embedder()
store = get_store()
CHUNKS_COL = collection_name(CHUNKS, embedder)
ABSTRACTS_COL = collection_name(ABSTRACTS, embedder)
store.ensure_collection(CHUNKS_COL, embedder.dim)
store.ensure_collection(ABSTRACTS_COL, embedder.dim)


class IngestRequest(BaseModel):
    version_id: str
    submission_id: str
    uploader_id: str = ""
    institution_id: str = ""
    text: str
    status: str = "submitted"
    visibility: str = "public"
    discipline: str = ""
    language: str = "en"
    year: int = 0
    title: str = ""


class SimilarityRequest(BaseModel):
    submission_id: str
    uploader_id: str = ""
    text: str
    threshold: float = 0.82
    self_check: bool = False


class SearchRequest(BaseModel):
    query: str
    k: int = 10
    filters: dict[str, dict[str, Any]] | None = None


class RelatedRequest(BaseModel):
    abstract: str
    submission_id: str
    k: int = 5


class MatchRequest(BaseModel):
    abstract: str
    exclude_user_ids: list[str] = []
    k: int = 5


class StatusRequest(BaseModel):
    version_id: str
    payload: dict[str, Any]


class RebuildRequest(BaseModel):
    records: list[IngestRequest]


@app.get("/health")
def health():
    return {
        "embedding_model": embedder.name,
        "embedding_dim": embedder.dim,
        "chunks_collection": CHUNKS_COL,
        "abstracts_collection": ABSTRACTS_COL,
        "chunks": store.count(CHUNKS_COL),
        "papers": store.count(ABSTRACTS_COL),
    }


@app.post("/ingest")
def ingest(req: IngestRequest):
    record = req.model_dump()
    n = ingest_version(embedder, store, CHUNKS_COL, ABSTRACTS_COL, record)
    return {"chunks": n}


@app.post("/similarity")
def similarity(req: SimilarityRequest):
    return run_similarity(
        embedder, store, CHUNKS_COL,
        text=req.text, submission_id=req.submission_id,
        uploader_id=req.uploader_id, threshold=req.threshold,
        self_check=req.self_check,
    )


@app.post("/search")
def search(req: SearchRequest):
    return {"results": semantic_search(embedder, store, ABSTRACTS_COL,
                                       query=req.query, limit=req.k, filters=req.filters)}


@app.post("/related")
def related(req: RelatedRequest):
    return {"results": related_versions(embedder, store, ABSTRACTS_COL,
                                        abstract=req.abstract,
                                        submission_id=req.submission_id, limit=req.k)}


@app.post("/reviewers/match")
def reviewers_match(req: MatchRequest):
    return {"results": match_reviewers(embedder, store, ABSTRACTS_COL,
                                       abstract=req.abstract,
                                       exclude_user_ids=req.exclude_user_ids,
                                       limit=req.k)}


@app.post("/status")
def set_status(req: StatusRequest):
    """Propagate lifecycle changes (published/retracted/superseded) into the
    stored payloads so search filtering stays truthful."""
    for col in (CHUNKS_COL, ABSTRACTS_COL):
        store.set_payload(col, {"must": {"version_id": req.version_id}}, req.payload)
    return {"status": "ok"}


@app.post("/rebuild")
def rebuild(req: RebuildRequest):
    """Disaster recovery for the vector layer: wipe and re-ingest. The caller
    streams records recovered from IPFS + the chain."""
    store.drop_collection(CHUNKS_COL)
    store.drop_collection(ABSTRACTS_COL)
    store.ensure_collection(CHUNKS_COL, embedder.dim)
    store.ensure_collection(ABSTRACTS_COL, embedder.dim)
    total = sum(
        ingest_version(embedder, store, CHUNKS_COL, ABSTRACTS_COL, r.model_dump())
        for r in req.records
    )
    return {"papers": len(req.records), "chunks": total}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
