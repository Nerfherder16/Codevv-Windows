from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, async_session
from app.core.security import get_current_user
from app.core.background import enqueue
from app.models.user import User
from app.models.deploy import Environment, DeployJob
from app.schemas.deploy import (
    EnvironmentCreate,
    EnvironmentUpdate,
    EnvironmentResponse,
    DeployRequest,
    DeployJobResponse,
    GenerateComposeRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.compose_gen import generate_compose_from_canvas
import uuid
import json
import structlog
from datetime import datetime, timezone

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/deploy", tags=["deploy"])


def _env_response(env: Environment) -> EnvironmentResponse:
    """Build an EnvironmentResponse, deserializing config_json from Text."""
    config = None
    if env.config_json:
        config = json.loads(env.config_json)
    return EnvironmentResponse(
        id=env.id,
        project_id=env.project_id,
        name=env.name,
        config_json=config,
        compose_yaml=env.compose_yaml,
        created_at=env.created_at,
        updated_at=env.updated_at,
    )


def _job_response(job: DeployJob) -> DeployJobResponse:
    """Build a DeployJobResponse."""
    return DeployJobResponse(
        id=job.id,
        environment_id=job.environment_id,
        status=job.status,
        logs=job.logs,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_by=job.created_by,
        created_at=job.created_at,
    )


async def _run_deploy(job_id: str):
    """Background placeholder for deploy execution."""
    async with async_session() as db:
        result = await db.execute(select(DeployJob).where(DeployJob.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        await db.flush()
        await db.commit()

        # Placeholder — in a real deploy, this would run docker compose up, etc.
        job.status = "completed"
        job.logs = "Desktop mode: deploy simulation completed successfully."
        job.completed_at = datetime.now(timezone.utc)
        await db.flush()
        await db.commit()


@router.post("/environments", response_model=EnvironmentResponse, status_code=status.HTTP_201_CREATED)
async def create_environment(
    project_id: str,
    body: EnvironmentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new deployment environment."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    config_str = None
    if body.config_json is not None:
        config_str = json.dumps(body.config_json)

    env = Environment(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=body.name,
        config_json=config_str,
    )
    db.add(env)
    await db.flush()

    return _env_response(env)


@router.get("/environments", response_model=list[EnvironmentResponse])
async def list_environments(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all environments for a project."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Environment).where(Environment.project_id == project_id)
    )
    envs = result.scalars().all()

    return [_env_response(e) for e in envs]


@router.patch("/environments/{env_id}", response_model=EnvironmentResponse)
async def update_environment(
    project_id: str,
    env_id: str,
    body: EnvironmentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update environment name, config, or compose yaml."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(Environment).where(
            Environment.id == env_id,
            Environment.project_id == project_id,
        )
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    if body.name is not None:
        env.name = body.name
    if body.config_json is not None:
        env.config_json = json.dumps(body.config_json)
    if body.compose_yaml is not None:
        env.compose_yaml = body.compose_yaml

    await db.flush()
    return _env_response(env)


@router.post("/generate-compose", response_model=EnvironmentResponse)
async def generate_compose(
    project_id: str,
    body: GenerateComposeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a docker-compose.yaml from canvas components. Creates or updates the named environment."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    try:
        compose_yaml = await generate_compose_from_canvas(body.canvas_id, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    # Find or create the environment by name
    result = await db.execute(
        select(Environment).where(
            Environment.project_id == project_id,
            Environment.name == body.environment_name,
        )
    )
    env = result.scalar_one_or_none()

    if env:
        env.compose_yaml = compose_yaml
    else:
        env = Environment(
            id=str(uuid.uuid4()),
            project_id=project_id,
            name=body.environment_name,
            compose_yaml=compose_yaml,
        )
        db.add(env)

    await db.flush()
    return _env_response(env)


@router.post("/jobs", response_model=DeployJobResponse, status_code=status.HTTP_201_CREATED)
async def create_deploy_job(
    project_id: str,
    body: DeployRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a deploy job and enqueue it for background execution."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    # Verify the environment exists and belongs to this project
    result = await db.execute(
        select(Environment).where(
            Environment.id == body.environment_id,
            Environment.project_id == project_id,
        )
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    job = DeployJob(
        id=str(uuid.uuid4()),
        environment_id=body.environment_id,
        created_by=user.id,
    )
    db.add(job)
    await db.flush()

    await enqueue("deploy", _run_deploy, job.id)

    return _job_response(job)


@router.get("/jobs/{job_id}", response_model=DeployJobResponse)
async def get_deploy_job(
    project_id: str,
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a deploy job by ID."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(DeployJob)
        .join(Environment)
        .where(
            DeployJob.id == job_id,
            Environment.project_id == project_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deploy job not found")

    return _job_response(job)
