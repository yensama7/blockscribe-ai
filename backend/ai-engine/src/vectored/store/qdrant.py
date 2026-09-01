"""Qdrant-backed VectorStore. Used for everything — tests run it embedded
with QdrantClient(':memory:'), production points QDRANT_URL at a server."""

from typing import Any, Sequence

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from .base import Filters, Hit


def _to_filter(filters: Filters | None) -> qm.Filter | None:
    if not filters:
        return None
    must = [
        qm.FieldCondition(key=k, match=qm.MatchValue(value=v))
        for k, v in (filters.get("must") or {}).items()
    ]
    must_not = [
        qm.FieldCondition(key=k, match=qm.MatchValue(value=v))
        for k, v in (filters.get("must_not") or {}).items()
    ]
    if not must and not must_not:
        return None
    return qm.Filter(must=must or None, must_not=must_not or None)


class QdrantStore:
    def __init__(self, url: str | None = None, path: str | None = None):
        if url == ":memory:" or (url is None and path is None):
            self._client = QdrantClient(":memory:")
        elif path:
            self._client = QdrantClient(path=path)
        else:
            self._client = QdrantClient(url=url)

    def ensure_collection(self, name: str, dim: int) -> None:
        if not self._client.collection_exists(name):
            self._client.create_collection(
                collection_name=name,
                vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE),
            )

    def upsert(
        self,
        name: str,
        ids: Sequence[str],
        vectors: Sequence[Sequence[float]],
        payloads: Sequence[dict[str, Any]],
    ) -> None:
        if not ids:
            return
        self._client.upsert(
            collection_name=name,
            points=qm.Batch(ids=list(ids), vectors=[list(v) for v in vectors], payloads=list(payloads)),
        )

    def search(
        self, name: str, vector: Sequence[float], limit: int, filters: Filters | None = None
    ) -> list[Hit]:
        res = self._client.query_points(
            collection_name=name,
            query=list(vector),
            limit=limit,
            query_filter=_to_filter(filters),
            with_payload=True,
        )
        return [Hit(id=str(p.id), score=p.score, payload=p.payload or {}) for p in res.points]

    def delete(self, name: str, ids: Sequence[str]) -> None:
        if ids:
            self._client.delete(collection_name=name, points_selector=qm.PointIdsList(points=list(ids)))

    def set_payload(self, name: str, filters: Filters, payload: dict[str, Any]) -> None:
        f = _to_filter(filters)
        if f is None:
            return
        self._client.set_payload(
            collection_name=name,
            payload=payload,
            points=qm.FilterSelector(filter=f),
        )

    def drop_collection(self, name: str) -> None:
        if self._client.collection_exists(name):
            self._client.delete_collection(name)

    def count(self, name: str) -> int:
        if not self._client.collection_exists(name):
            return 0
        return self._client.count(collection_name=name).count
