"""Deterministic embedder for tests: hashed bag-of-words, L2-normalised.
Identical text -> identical vector; shared vocabulary -> graded similarity.
Lets the suite exercise chunking, upsert, filtering and grouping in
milliseconds without loading an ML library (restructure.md §7)."""

import hashlib
import math
import re
from typing import Sequence


class FakeEmbedder:
    def __init__(self, dim: int = 64):
        self.name = "fake"
        self.dim = dim

    def _one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in re.findall(r"\w+", text.lower()):
            h = int.from_bytes(hashlib.sha256(token.encode()).digest()[:8], "big")
            vec[h % self.dim] += 1.0 if (h >> 32) % 2 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]
