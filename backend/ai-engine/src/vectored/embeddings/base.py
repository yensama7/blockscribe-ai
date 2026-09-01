"""Embedder protocol. Nothing above the config factory imports a concrete
implementation (restructure.md §7)."""

from typing import Protocol, Sequence


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...
