"""Async client wrapping the Recall REST API at recall_url."""

from __future__ import annotations

import httpx
import structlog
from functools import lru_cache
from app.core.config import get_settings

logger = structlog.get_logger()

# Valid Recall memory types
MEMORY_TYPE_MAP = {
    "fact": "semantic",
    "semantic": "semantic",
    "episodic": "episodic",
    "procedural": "procedural",
    "working": "working",
}

# Valid Recall relationship types
VALID_REL_TYPES = {
    "related_to", "caused_by", "solved_by", "supersedes",
    "derived_from", "contradicts", "requires", "part_of",
}


class RecallClient:
    """Thin async wrapper around the Recall HTTP API."""

    def __init__(self, base_url: str):
        self._base = base_url.rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base, timeout=30.0)

    async def store(
        self,
        content: str,
        memory_type: str = "semantic",
        domain: str = "general",
        importance: float = 0.5,
        tags: list[str] | None = None,
    ) -> dict:
        # Map friendly types to Recall's enum
        recall_type = MEMORY_TYPE_MAP.get(memory_type, "semantic")
        resp = await self._client.post(
            "/memory/store",
            json={
                "content": content,
                "memory_type": recall_type,
                "domain": domain,
                "importance": importance,
                "tags": tags or [],
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def search(
        self, query: str, domain: str | None = None, limit: int = 10
    ) -> list[dict]:
        body: dict = {"query": query, "limit": limit}
        if domain:
            body["domains"] = [domain]
        resp = await self._client.post("/search/query", json=body)
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", data) if isinstance(data, dict) else data

    async def browse(
        self, query: str, domain: str | None = None, limit: int = 100
    ) -> list[dict]:
        """Browse/list memories — returns more detailed results."""
        body: dict = {"query": query, "limit": min(limit, 100), "expand_relationships": True}
        if domain:
            body["domains"] = [domain]
        resp = await self._client.post("/search/browse", json=body)
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", data) if isinstance(data, dict) else data

    async def get_context(
        self, query: str, max_tokens: int = 2000
    ) -> str:
        body: dict = {"query": query, "max_tokens": max_tokens}
        resp = await self._client.post("/search/context", json=body)
        resp.raise_for_status()
        data = resp.json()
        return data.get("context", "") if isinstance(data, dict) else str(data)

    async def get_memory(self, memory_id: str) -> dict:
        resp = await self._client.get(f"/memory/{memory_id}")
        resp.raise_for_status()
        return resp.json()

    async def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        strength: float = 0.5,
    ) -> dict:
        # Map Build Hub relation types to Recall's enum
        recall_rel = rel_type if rel_type in VALID_REL_TYPES else "related_to"
        resp = await self._client.post(
            "/memory/relationship",
            json={
                "source_id": source_id,
                "target_id": target_id,
                "relationship_type": recall_rel,
                "strength": strength,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_related(
        self, memory_id: str, max_depth: int = 2
    ) -> list[dict]:
        resp = await self._client.get(
            f"/memory/{memory_id}/related",
            params={"max_depth": max_depth},
        )
        resp.raise_for_status()
        return resp.json()

    async def health(self) -> dict:
        resp = await self._client.get("/health")
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self._client.aclose()


@lru_cache
def get_recall_client() -> RecallClient:
    settings = get_settings()
    return RecallClient(settings.recall_url)
