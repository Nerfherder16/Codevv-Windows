"""Business Rules — proxies pinned Recall memories for a project."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.recall_client import get_recall_client
from app.models.user import User
from app.models.project import Project
from app.schemas.rules import RulePinRequest, RuleSearchRequest, RecallMemoryResponse
from app.api.routes.projects import get_project_with_access
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/rules", tags=["rules"])


async def _get_project_domain(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return f"codevv:{project.slug}"


def _normalize_memory(raw: dict) -> dict:
    """Normalize a Recall memory response to match RecallMemoryResponse."""
    return {
        "id": raw.get("id", raw.get("memory_id", "")),
        "content": raw.get("content", ""),
        "domain": raw.get("domain", ""),
        "tags": raw.get("tags", []),
        "importance": raw.get("importance", 0.5),
        "pinned": raw.get("pinned", False),
        "memory_type": raw.get("memory_type", "semantic"),
        "created_at": raw.get("created_at", ""),
    }


@router.get("", response_model=list[RecallMemoryResponse])
async def list_pinned_rules(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    domain = await _get_project_domain(project_id, db)

    recall = get_recall_client()
    try:
        results = await recall.browse("business rules", domain=domain, limit=100)
        pinned = [_normalize_memory(r) for r in results if r.get("pinned")]
        return pinned
    except ConnectionError:
        return []


@router.post("/pin", status_code=status.HTTP_201_CREATED)
async def pin_rule(
    project_id: str,
    body: RulePinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    recall = get_recall_client()
    try:
        # Recall doesn't have a native pin endpoint in the current API,
        # so we store a tag to mark it as pinned
        memory = await recall.get_memory(body.memory_id)
        tags = memory.get("tags", [])
        if "pinned:rule" not in tags:
            tags.append("pinned:rule")
        # Update by re-storing with pin tag
        await recall.store(
            content=memory.get("content", ""),
            memory_type=memory.get("memory_type", "semantic"),
            domain=memory.get("domain", "general"),
            importance=max(memory.get("importance", 0.5), 0.8),
            tags=tags,
        )
        return {"status": "pinned"}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Recall unavailable: {e}")


@router.delete("/{memory_id}/pin")
async def unpin_rule(
    project_id: str,
    memory_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    recall = get_recall_client()
    try:
        memory = await recall.get_memory(memory_id)
        tags = [t for t in memory.get("tags", []) if t != "pinned:rule"]
        await recall.store(
            content=memory.get("content", ""),
            memory_type=memory.get("memory_type", "semantic"),
            domain=memory.get("domain", "general"),
            importance=memory.get("importance", 0.5),
            tags=tags,
        )
        return {"status": "unpinned"}
    except ConnectionError as e:
        raise HTTPException(status_code=503, detail=f"Recall unavailable: {e}")


@router.post("/search", response_model=list[RecallMemoryResponse])
async def search_rules(
    project_id: str,
    body: RuleSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)
    domain = await _get_project_domain(project_id, db)

    recall = get_recall_client()
    try:
        results = await recall.search(body.query, domain=domain, limit=20)
        return [_normalize_memory(r) for r in results]
    except ConnectionError:
        return []
