"""Agent Pipeline — track AI agent runs and findings."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.pipeline import AgentRun, AgentFinding
from app.schemas.pipeline import (
    AgentRunCreate,
    AgentRunResponse,
    AgentRunDetailResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid
import json
from datetime import datetime, timezone

router = APIRouter(prefix="/projects/{project_id}/pipeline", tags=["pipeline"])


def _run_response(run: AgentRun, findings_count: int = 0) -> dict:
    return {
        "id": run.id,
        "project_id": run.project_id,
        "agent_type": run.agent_type,
        "status": run.status,
        "input_json": json.loads(run.input_json) if run.input_json else None,
        "output_json": json.loads(run.output_json) if run.output_json else None,
        "error_message": run.error_message,
        "findings_count": findings_count,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "created_by": run.created_by,
        "created_at": run.created_at,
    }


@router.get("", response_model=list[AgentRunResponse])
async def list_runs(
    project_id: str,
    agent_type: str | None = None,
    status_filter: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    query = select(AgentRun).where(AgentRun.project_id == project_id)
    if agent_type:
        query = query.where(AgentRun.agent_type == agent_type)
    if status_filter:
        query = query.where(AgentRun.status == status_filter)
    query = query.order_by(AgentRun.created_at.desc())

    result = await db.execute(query)
    runs = result.scalars().all()

    # Get findings counts
    responses = []
    for run in runs:
        count_result = await db.execute(
            select(func.count()).where(AgentFinding.run_id == run.id)
        )
        count = count_result.scalar() or 0
        responses.append(_run_response(run, count))

    return responses


@router.post("", response_model=AgentRunResponse, status_code=status.HTTP_201_CREATED)
async def create_run(
    project_id: str,
    body: AgentRunCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    run = AgentRun(
        id=str(uuid.uuid4()),
        project_id=project_id,
        agent_type=body.agent_type,
        status="completed",
        input_json=json.dumps(body.input_json) if body.input_json else None,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
        created_by=user.id,
    )
    db.add(run)
    await db.flush()

    return _run_response(run)


@router.get("/{run_id}", response_model=AgentRunDetailResponse)
async def get_run(
    project_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(AgentRun).where(
            AgentRun.id == run_id,
            AgentRun.project_id == project_id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    findings_result = await db.execute(
        select(AgentFinding).where(AgentFinding.run_id == run_id)
    )
    findings = findings_result.scalars().all()

    resp = _run_response(run, len(findings))
    resp["findings"] = [
        {
            "id": f.id,
            "run_id": f.run_id,
            "severity": f.severity,
            "title": f.title,
            "description": f.description,
            "file_path": f.file_path,
            "created_at": f.created_at,
        }
        for f in findings
    ]
    return resp


@router.post("/{run_id}/cancel")
async def cancel_run(
    project_id: str,
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(AgentRun).where(
            AgentRun.id == run_id,
            AgentRun.project_id == project_id,
        )
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.status in ("queued", "running"):
        run.status = "failed"
        run.error_message = "Cancelled by user"
        run.completed_at = datetime.now(timezone.utc)
        await db.flush()

    return {"status": "cancelled"}
