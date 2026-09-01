"""Self-hosted embeddings via sentence-transformers.
Dev default: all-MiniLM-L6-v2 (384d). Production: BAAI/bge-m3 (1024d)."""

from typing import Sequence


class LocalEmbedder:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        # imported here so the rest of the service never loads torch
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)
        self.name = model_name
        self.dim = self._model.get_sentence_embedding_dimension()

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._model.encode(list(texts), normalize_embeddings=True).tolist()
