"""End-to-end vector pipeline over FakeEmbedder + embedded Qdrant:
ingest, plagiarism detection, search, reviewer matching, rebuild semantics.
Runs in milliseconds with no ML library and no Docker."""

import pytest

from embeddings.fake import FakeEmbedder
from matching import match_reviewers
from similarity import ingest_version, run_similarity, semantic_search
from store.qdrant import QdrantStore

CHUNKS_COL = "chunks__fake__64"
ABSTRACTS_COL = "abstracts__fake__64"

PAPER_A = (
    "Abstract\nA study of drought resistant maize varieties in northern Nigeria.\n"
    "Introduction\n" + " ".join(
        f"maize drought resistance field trial season{i} yield irrigation soil nitrogen"
        for i in range(80)
    )
)
PAPER_B = (
    "Abstract\nMobile banking adoption among rural traders in Ghana.\n"
    "Introduction\n" + " ".join(
        f"mobile banking adoption trader survey region{i} fintech transaction trust agent"
        for i in range(80)
    )
)


def make_stack():
    return FakeEmbedder(dim=64), QdrantStore(url=":memory:")


def ingest(embedder, store, version_id, submission_id, uploader_id, text, title=""):
    return ingest_version(embedder, store, CHUNKS_COL, ABSTRACTS_COL, {
        "version_id": version_id, "submission_id": submission_id,
        "uploader_id": uploader_id, "institution_id": "inst-1",
        "status": "published", "visibility": "public",
        "discipline": "test", "language": "en", "year": 2026,
        "title": title, "text": text,
    })


def test_ingest_is_idempotent():
    embedder, store = make_stack()
    n1 = ingest(embedder, store, "v1", "s1", "u1", PAPER_A)
    count_after_first = store.count(CHUNKS_COL)
    n2 = ingest(embedder, store, "v1", "s1", "u1", PAPER_A)
    assert n1 == n2
    assert store.count(CHUNKS_COL) == count_after_first  # upsert, not append


def test_verbatim_copy_is_flagged_and_unrelated_paper_is_clean():
    embedder, store = make_stack()
    ingest(embedder, store, "v1", "s1", "u1", PAPER_A)
    ingest(embedder, store, "v2", "s2", "u2", PAPER_B)

    # verbatim copy of paper A submitted as a new submission
    report = run_similarity(embedder, store, CHUNKS_COL, text=PAPER_A,
                            submission_id="s3", threshold=0.9)
    assert report["flagged_chunks"] > 0
    assert report["max_score"] >= 0.99
    sources = {m["source_submission_id"]
               for p in report["passages"] for m in p["matches"]}
    assert sources == {"s1"}  # matched the original only, not paper B

    # an unrelated paper comes back clean
    clean = run_similarity(
        embedder, store, CHUNKS_COL,
        text="Abstract\nOral history archives of coastal fishing songs.\n" +
             " ".join(f"song melody fisher canoe tide lyric{i}" for i in range(200)),
        submission_id="s4", threshold=0.9)
    assert clean["flagged_chunks"] == 0


def test_own_submission_is_excluded_from_its_report():
    embedder, store = make_stack()
    ingest(embedder, store, "v1", "s1", "u1", PAPER_A)
    report = run_similarity(embedder, store, CHUNKS_COL, text=PAPER_A,
                            submission_id="s1", threshold=0.9)
    assert report["flagged_chunks"] == 0


def test_semantic_search_returns_right_paper():
    embedder, store = make_stack()
    ingest(embedder, store, "v1", "s1", "u1", PAPER_A, title="Maize drought study")
    ingest(embedder, store, "v2", "s2", "u2", PAPER_B, title="Mobile banking study")
    results = semantic_search(embedder, store, ABSTRACTS_COL,
                              query="drought resistant maize varieties", limit=1)
    assert results and results[0]["submission_id"] == "s1"


def test_reviewer_matching_excludes_conflicts():
    embedder, store = make_stack()
    ingest(embedder, store, "v1", "s1", "expert-maize", PAPER_A)
    ingest(embedder, store, "v2", "s2", "expert-banking", PAPER_B)

    abstract = "Drought tolerance of improved maize varieties under irrigation."
    ranked = match_reviewers(embedder, store, ABSTRACTS_COL, abstract=abstract,
                             exclude_user_ids=["the-author"])
    assert ranked and ranked[0]["user_id"] == "expert-maize"

    # the best candidate disappears when conflicted (e.g. co-author)
    ranked = match_reviewers(embedder, store, ABSTRACTS_COL, abstract=abstract,
                             exclude_user_ids=["the-author", "expert-maize"])
    assert all(r["user_id"] != "expert-maize" for r in ranked)


def test_status_propagation_via_set_payload():
    embedder, store = make_stack()
    ingest(embedder, store, "v1", "s1", "u1", PAPER_A)
    store.set_payload(ABSTRACTS_COL, {"must": {"version_id": "v1"}},
                      {"status": "retracted"})
    results = semantic_search(embedder, store, ABSTRACTS_COL,
                              query="maize drought", limit=5)
    assert results and results[0]["status"] == "retracted"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
