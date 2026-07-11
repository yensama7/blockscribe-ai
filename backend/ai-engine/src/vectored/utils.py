import os
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from sklearn.cluster import KMeans
from collections import Counter

DB_PATH = os.environ.get("DB_PATH", "archive.db")

def fetch_records(db_path=None):
    path = db_path or DB_PATH
    if not os.path.exists(path):
        return []
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, genre, title, difficulty, summary, file_hash, file_cid FROM archive")
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row[0],
            "genre": row[1] or "",
            "title": row[2] or "",
            "difficulty": row[3] or "",
            "summary": row[4] or "",
            "file_hash": row[5] or "",
            "file_cid": row[6] or "",
        }
        for row in rows
    ]

model = SentenceTransformer("all-MiniLM-L6-v2")

# ponytail: ephemeral is correct here — chroma_store has no named volume, so data
# is rebuilt from SQLite on each startup via startup_ingest()
chroma_client = chromadb.EphemeralClient()

try:
    collection = chroma_client.get_collection("records_collection")
except Exception:
    collection = chroma_client.create_collection(
        name="records_collection",
        metadata={"hnsw:space": "cosine"}
    )

def ingest_data(records):
    if not records:
        return
    texts = [f"{r['title']} - {r['difficulty']} - {r['genre']}" for r in records]
    embeddings = model.encode(texts).tolist()
    # upsert instead of add — safe to call multiple times with the same IDs
    collection.upsert(
        embeddings=embeddings,
        documents=texts,
        ids=[str(r["id"]) for r in records],
        metadatas=records
    )

def query_records(query, k=3, filters=None):
    query_embedding = model.encode([query]).tolist()
    count = collection.count()
    if count == 0:
        return {"id": [[]], "documents": [[]], "metadatas": [[]], "distances": [[]]}
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=min(k, count),
        where=filters
    )
    return results

def cluster_records(n_clusters=3):
    data = collection.get(include=["embeddings", "metadatas"])
    embeddings = data.get("embeddings") or []
    metadatas = data.get("metadatas") or []
    if len(embeddings) < n_clusters:
        return {}
    kmeans = KMeans(n_clusters=n_clusters, random_state=42).fit(np.array(embeddings))
    clusters = {}
    for idx, label in enumerate(kmeans.labels_):
        clusters.setdefault(int(label), []).append(metadatas[idx])
    return clusters

def difficulty_distribution():
    data = collection.get(include=["metadatas"])
    difficulties = [r["difficulty"] for r in (data.get("metadatas") or [])]
    return dict(Counter(difficulties))

def genre_distribution():
    data = collection.get(include=["metadatas"])
    genres = [r["genre"] for r in (data.get("metadatas") or [])]
    return dict(Counter(genres))
