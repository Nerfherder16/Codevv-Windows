import json
import httpx
import numpy as np
from app.core.config import get_settings

settings = get_settings()


async def get_embedding(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/embed",
            json={"model": settings.ollama_embed_model, "input": text},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"][0]


def embedding_to_json(embedding: list[float]) -> str:
    return json.dumps(embedding)


def embedding_from_json(text: str | None) -> list[float] | None:
    if not text:
        return None
    return json.loads(text)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(dot / norm)
