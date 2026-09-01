"""Optional hosted embedder against any OpenAI-compatible /embeddings
endpoint. Fallback only — production embeds are self-hosted (restructure.md §6)."""

import os
from typing import Sequence

import requests


class GroqEmbedder:
    def __init__(self, model: str, dim: int, base_url: str | None = None, api_key: str | None = None):
        self.name = model
        self.dim = dim
        self._base = (base_url or os.environ.get("EMBEDDING_API_BASE", "https://api.groq.com/openai/v1")).rstrip("/")
        self._key = api_key or os.environ.get("GROQ_API_KEY", "")

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = requests.post(
            f"{self._base}/embeddings",
            headers={"Authorization": f"Bearer {self._key}"},
            json={"model": self.name, "input": list(texts)},
            timeout=60,
        )
        resp.raise_for_status()
        data = sorted(resp.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]
