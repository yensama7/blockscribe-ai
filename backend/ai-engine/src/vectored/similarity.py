"""Ingestion and plagiarism/duplicate detection over chunk vectors.

Chunk-level embeddings catch a copied methodology section; one abstract-level
vector per paper serves browse, related-papers and reviewer matching."""

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

from chunking import chunk_text, extract_abstract
from store.base import VectorStore

CHUNKS = "chunks"
ABSTRACTS = "abstracts"

# Sections that produce meaningless high scores (restructure.md §15:
# "exclude the expected matches").
_EXCLUDED_SECTIONS = {"references", "bibliography", "acknowledgements", "acknowledgments"}


def _point_id(version_id: str, suffix: str) -> str:
    # deterministic ids -> reprocessing the same version is a no-op upsert
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{version_id}:{suffix}"))


def ingest_version(embedder, store: VectorStore, chunks_col: str, abstracts_col: str,
                   version: dict[str, Any]) -> int:
    """Chunk, embed and upsert one version. `version` carries the payload
    fields from restructure.md §5 plus `text`."""
    text = version.pop("text", "")
    chunks = chunk_text(text)

    base_payload = {
        **version,
        "embedding_model": embedder.name,
        "embedding_dim": embedder.dim,
    }

    if chunks:
        vectors = embedder.embed([c.text for c in chunks])
        ids, payloads = [], []
        for c in chunks:
            ids.append(_point_id(version["version_id"], str(c.index)))
            payloads.append({**base_payload, "chunk_index": c.index, "section": c.section,
                             "chunk_text": c.text})
        store.ensure_collection(chunks_col, embedder.dim)
        store.upsert(chunks_col, ids, vectors, payloads)

    abstract = extract_abstract(text)
    if abstract:
        store.ensure_collection(abstracts_col, embedder.dim)
        store.upsert(
            abstracts_col,
            [_point_id(version["version_id"], "abstract")],
            embedder.embed([abstract]),
            [{**base_payload, "abstract": abstract}],
        )
    return len(chunks)


@dataclass
class PassageMatch:
    source_version_id: str
    source_submission_id: str
    score: float
    matched_text: str
    matched_chunk_index: int


@dataclass
class Passage:
    chunk_start: int
    chunk_end: int
    passage_text: str
    top_score: float
    matches: list[PassageMatch] = field(default_factory=list)


def run_similarity(embedder, store: VectorStore, chunks_col: str, *,
                   text: str, submission_id: str, uploader_id: str | None = None,
                   threshold: float = 0.82, self_check: bool = False,
                   per_chunk_limit: int = 3) -> dict[str, Any]:
    """Query every chunk of `text` against the corpus. Contiguous flagged
    chunks are grouped into passages for side-by-side display.

    External plagiarism excludes the author's own submission; pass
    self_check=True to look only at the author's prior work instead.
    """
    chunks = chunk_text(text)
    if not chunks or store.count(chunks_col) == 0:
        return {"model": embedder.name, "threshold": threshold, "passages": [],
                "flagged_chunks": 0, "total_chunks": len(chunks), "max_score": 0.0}

    vectors = embedder.embed([c.text for c in chunks])

    filters: dict[str, dict[str, Any]] = {"must_not": {"submission_id": submission_id}}
    if self_check and uploader_id:
        filters = {"must": {"uploader_id": uploader_id},
                   "must_not": {"submission_id": submission_id}}

    flagged: dict[int, list[PassageMatch]] = {}
    for chunk, vector in zip(chunks, vectors):
        if chunk.section in _EXCLUDED_SECTIONS:
            continue
        hits = store.search(chunks_col, vector, limit=per_chunk_limit, filters=filters)
        matches = [
            PassageMatch(
                source_version_id=h.payload.get("version_id", ""),
                source_submission_id=h.payload.get("submission_id", ""),
                score=round(h.score, 4),
                matched_text=h.payload.get("chunk_text", ""),
                matched_chunk_index=h.payload.get("chunk_index", -1),
            )
            for h in hits
            if h.score >= threshold and h.payload.get("section") not in _EXCLUDED_SECTIONS
        ]
        if matches:
            flagged[chunk.index] = matches

    # group contiguous flagged chunks into passages
    passages: list[Passage] = []
    current: Passage | None = None
    for chunk in chunks:
        if chunk.index in flagged:
            if current is not None and chunk.index == current.chunk_end + 1:
                current.chunk_end = chunk.index
                current.matches.extend(flagged[chunk.index])
                current.passage_text += " […] " + chunk.text
            else:
                current = Passage(chunk_start=chunk.index, chunk_end=chunk.index,
                                  passage_text=chunk.text, top_score=0.0,
                                  matches=list(flagged[chunk.index]))
                passages.append(current)
        else:
            current = None

    for p in passages:
        p.matches.sort(key=lambda m: m.score, reverse=True)
        p.top_score = p.matches[0].score if p.matches else 0.0

    max_score = max((p.top_score for p in passages), default=0.0)
    return {
        "model": embedder.name,
        "threshold": threshold,
        "total_chunks": len(chunks),
        "flagged_chunks": len(flagged),
        "max_score": max_score,
        "passages": [asdict(p) for p in passages],
    }


def semantic_search(embedder, store: VectorStore, abstracts_col: str, *,
                    query: str, limit: int = 10,
                    filters: dict | None = None) -> list[dict[str, Any]]:
    """Concept search over abstract-level vectors — returns papers."""
    if store.count(abstracts_col) == 0:
        return []
    vector = embedder.embed([query])[0]
    hits = store.search(abstracts_col, vector, limit=limit, filters=filters)
    return [{"score": round(h.score, 4), **h.payload} for h in hits]


def related_versions(embedder, store: VectorStore, abstracts_col: str, *,
                     abstract: str, submission_id: str, limit: int = 5) -> list[dict[str, Any]]:
    """Nearest neighbours on the abstract vector, excluding the paper itself."""
    if store.count(abstracts_col) == 0:
        return []
    vector = embedder.embed([abstract])[0]
    hits = store.search(abstracts_col, vector, limit=limit,
                        filters={"must_not": {"submission_id": submission_id}})
    return [{"score": round(h.score, 4), **h.payload} for h in hits]
