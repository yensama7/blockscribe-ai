import os
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings
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
            "genre": row[1],
            "title": row[2],
            "difficulty": row[3],
            "summary": row[4],
            "file_hash": row[5],
            "file_cid": row[6],
        }
        for row in rows
    ]

model = SentenceTransformer("all-MiniLM-L6-v2")

chroma_client = chromadb.Client(Settings(persist_directory="./chroma_store"))

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
    collection.add(
        embeddings=embeddings,
        documents=texts,
        ids=[str(r["id"]) for r in records],
        metadatas=records
    )

def query_records(query, k=3, filters=None):
    query_embedding = model.encode([query]).tolist()
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=k,
        where=filters
    )
    return results

def cluster_records(n_clusters=3):
    data = collection.get(include=["embeddings", "metadatas"])
    embeddings = np.array(data["embeddings"])
    metadatas = data["metadatas"]
    kmeans = KMeans(n_clusters=n_clusters, random_state=42).fit(embeddings)
    labels = kmeans.labels_
    clusters = {}
    for idx, label in enumerate(labels):
        clusters.setdefault(label, []).append(metadatas[idx])
    return clusters

def difficulty_distribution():
    data = collection.get(include=["metadatas"])
    difficulties = [r["difficulty"] for r in data["metadatas"]]
    return dict(Counter(difficulties))

def genre_distribution():
    data = collection.get(include=["metadatas"])
    genres = [r["genre"] for r in data["metadatas"]]
    return dict(Counter(genres))
