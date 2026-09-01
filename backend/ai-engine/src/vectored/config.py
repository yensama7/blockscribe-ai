"""Provider choice is a config value, never wired through the code
(restructure.md §7). Only this module imports concrete implementations."""

import os
from functools import lru_cache


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default).strip()


@lru_cache(maxsize=1)
def get_embedder():
    provider = _env("EMBEDDING_PROVIDER", "local").lower()
    model = _env("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    dim = int(_env("EMBEDDING_DIM", "384"))

    if provider == "fake":
        from embeddings.fake import FakeEmbedder

        return FakeEmbedder(dim=dim)
    if provider == "groq":
        from embeddings.groq import GroqEmbedder

        return GroqEmbedder(model=model, dim=dim)
    from embeddings.local import LocalEmbedder

    return LocalEmbedder(model_name=model)


@lru_cache(maxsize=1)
def get_store():
    from store.qdrant import QdrantStore

    url = _env("QDRANT_URL", "")
    path = _env("QDRANT_PATH", "")
    if url:
        return QdrantStore(url=url)
    if path:
        return QdrantStore(path=path)
    # ponytail: embedded in-process Qdrant by default — index is a cache and
    # rebuildable via /rebuild, so losing it on restart is acceptable in dev
    return QdrantStore(url=":memory:")


def collection_name(kind: str, embedder) -> str:
    """Model + dimension encoded in the name so switching models creates a
    fresh collection instead of erroring (the dimension trap, §7)."""
    safe_model = embedder.name.replace("/", "-")
    return f"{kind}__{safe_model}__{embedder.dim}"
