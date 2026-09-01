"""VectorStore protocol and the Hit result type."""

from dataclasses import dataclass, field
from typing import Any, Protocol, Sequence


@dataclass
class Hit:
    id: str
    score: float
    payload: dict[str, Any] = field(default_factory=dict)


# filters shape: {"must": {field: value, ...}, "must_not": {field: value, ...}}
Filters = dict[str, dict[str, Any]]


class VectorStore(Protocol):
    def ensure_collection(self, name: str, dim: int) -> None: ...

    def upsert(
        self,
        name: str,
        ids: Sequence[str],
        vectors: Sequence[Sequence[float]],
        payloads: Sequence[dict[str, Any]],
    ) -> None: ...

    def search(
        self, name: str, vector: Sequence[float], limit: int, filters: Filters | None = None
    ) -> list[Hit]: ...

    def delete(self, name: str, ids: Sequence[str]) -> None: ...

    def set_payload(self, name: str, filters: Filters, payload: dict[str, Any]) -> None: ...

    def drop_collection(self, name: str) -> None: ...

    def count(self, name: str) -> int: ...
