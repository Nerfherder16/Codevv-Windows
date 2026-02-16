from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, async_session
from app.core.security import get_current_user
from app.core.background import enqueue
from app.models.user import User
from app.models.scaffold import ScaffoldJob
from app.schemas.scaffold import ScaffoldRequest, ScaffoldApproval, ScaffoldResponse
from app.api.routes.projects import get_project_with_access
from app.services.scaffold import run_scaffold_job
import uuid
import json

router = APIRouter(prefix="/projects/{project_id}/scaffold", tags=["scaffold"])


def _scaffold_response(job: ScaffoldJob) -> ScaffoldResponse:
    """Build a ScaffoldResponse, deserializing JSON Text columns."""
    return ScaffoldResponse(
        id=job.id,
        project_id=job.project_id,
        canvas_id=job.canvas_id,
        component_ids=json.loads(job.component_ids) if job.component_ids else [],
        status=job.status,
        spec_json=json.loads(job.spec_json) if job.spec_json else None,
        generated_files=json.loads(job.generated_files) if job.generated_files else None,
        error_message=job.error_message,
        created_by=job.created_by,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )


async def _run_scaffold(job_id: str):
    """Background task: run scaffold generation with its own session."""
    async with async_session() as db:
        await run_scaffold_job(job_id, db)


@router.post("", response_model=ScaffoldResponse, status_code=status.HTTP_201_CREATED)
async def create_scaffold_job(
    project_id: str,
    body: ScaffoldRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a scaffold job and enqueue background generation."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    job_id = str(uuid.uuid4())
    job = ScaffoldJob(
        id=job_id,
        project_id=project_id,
        canvas_id=body.canvas_id,
        component_ids=json.dumps(body.component_ids),
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    await enqueue("scaffold", _run_scaffold, job.id)

    return _scaffold_response(job)


@router.get("", response_model=list[ScaffoldResponse])
async def list_scaffold_jobs(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all scaffold jobs for a project."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(ScaffoldJob)
        .where(ScaffoldJob.project_id == project_id)
        .order_by(ScaffoldJob.created_at.desc())
    )
    jobs = result.scalars().all()

    return [_scaffold_response(job) for job in jobs]


@router.get("/{job_id}", response_model=ScaffoldResponse)
async def get_scaffold_job(
    project_id: str,
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single scaffold job by ID."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(ScaffoldJob).where(
            ScaffoldJob.id == job_id,
            ScaffoldJob.project_id == project_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scaffold job not found")

    return _scaffold_response(job)


@router.post("/{job_id}/approve", response_model=ScaffoldResponse)
async def approve_scaffold_job(
    project_id: str,
    job_id: str,
    body: ScaffoldApproval,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a scaffold job. Only valid when status is 'review'."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(ScaffoldJob).where(
            ScaffoldJob.id == job_id,
            ScaffoldJob.project_id == project_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scaffold job not found")

    if job.status != "review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Job status is '{job.status}', can only approve/reject when 'review'",
        )

    job.status = "approved" if body.approved else "rejected"
    await db.flush()

    return _scaffold_response(job)
