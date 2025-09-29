# file: vector_service.py
from fastapi import FastAPI, Query
from pydantic import BaseModel
import uvicorn

# import your previous functions
from vectordb_pipeline import query_records, difficulty_distribution, genre_distribution, cluster_records

app = FastAPI()

class QueryRequest(BaseModel):
    query: str
    k: int = 3
    filters: dict | None = None

@app.post("/search")
def search(req: QueryRequest):
    results = query_records(req.query, k=req.k, filters=req.filters)
    return results

@app.get("/analytics/difficulty")
def analytics_difficulty():
    return difficulty_distribution()

@app.get("/analytics/genre")
def analytics_genre():
    return genre_distribution()

@app.get("/analytics/clusters")
def analytics_clusters(n: int = Query(3, description="Number of clusters")):
    return cluster_records(n_clusters=n)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
