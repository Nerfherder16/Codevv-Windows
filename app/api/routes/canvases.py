from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.canvas import Canvas, CanvasComponent
from app.schemas.canvas import (
    CanvasCreate,
    CanvasUpdate,
    ComponentCreate,
    CanvasResponse,
    CanvasDetailResponse,
    ComponentResponse,
)
from app.api.routes.projects import get_project_with_access
from app.core.background import enqueue
from app.core.database import async_session
from app.models.knowledge import KnowledgeEntity
from app.models.project import Project
from app.services.recall_knowledge import store_knowledge
import uuid
import json
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/canvases", tags=["canvases"])


async def _sync_component_to_knowledge(component_id: str, project_id: str):
    """Background: create KnowledgeEntity for a canvas component and push to Recall."""
    async with async_session() as db:
        result = await db.execute(
            select(CanvasComponent).where(CanvasComponent.id == component_id)
        )
        comp = result.scalar_one_or_none()
        if not comp:
            return

        entity = KnowledgeEntity(
            project_id=project_id,
            name=comp.name,
            entity_type=comp.component_type or "service",
            description=comp.description,
            source_type="canvas",
            source_id=comp.id,
        )
        db.add(entity)
        await db.flush()
        await db.commit()

        # Push to Recall
        try:
            proj_result = await db.execute(select(Project).where(Project.id == project_id))
            project = proj_result.scalar_one_or_none()
            if project:
                await store_knowledge(
                    project_slug=project.slug,
                    name=comp.name,
                    entity_type=comp.component_type or "service",
                    description=comp.description,
                    metadata={"source": "canvas", "tech_stack": comp.tech_stack or ""},
                )
        except Exception as e:
            logger.warning("component.recall_sync_failed", component_id=component_id, error=str(e))


def _component_response(comp: CanvasComponent) -> ComponentResponse:
    """Build a ComponentResponse, deserializing metadata_json from Text."""
    metadata = None
    if comp.metadata_json:
        metadata = json.loads(comp.metadata_json)
    return ComponentResponse(
        id=comp.id,
        canvas_id=comp.canvas_id,
        shape_id=comp.shape_id,
        name=comp.name,
        component_type=comp.component_type,
        tech_stack=comp.tech_stack,
        description=comp.description,
        metadata_json=metadata,
        created_at=comp.created_at,
    )


@router.post("", response_model=CanvasResponse, status_code=status.HTTP_201_CREATED)
async def create_canvas(
    project_id: str,
    body: CanvasCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new canvas in the project."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    canvas_id = str(uuid.uuid4())
    canvas = Canvas(
        id=canvas_id,
        project_id=project_id,
        name=body.name,
        yjs_doc_id=f"canvas-{canvas_id}",
        created_by=user.id,
    )
    db.add(canvas)
    await db.flush()

    return CanvasResponse(
        id=canvas.id,
        project_id=canvas.project_id,
        name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id,
        created_by=canvas.created_by,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
        component_count=0,
    )


@router.get("", response_model=list[CanvasResponse])
async def list_canvases(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all canvases in a project with component counts."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Canvas)
        .where(Canvas.project_id == project_id)
        .options(selectinload(Canvas.components))
    )
    canvases = result.scalars().all()

    return [
        CanvasResponse(
            id=c.id,
            project_id=c.project_id,
            name=c.name,
            yjs_doc_id=c.yjs_doc_id,
            created_by=c.created_by,
            created_at=c.created_at,
            updated_at=c.updated_at,
            component_count=len(c.components),
        )
        for c in canvases
    ]


@router.get("/{canvas_id}", response_model=CanvasDetailResponse)
async def get_canvas(
    project_id: str,
    canvas_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get canvas detail including tldraw snapshot and components."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Canvas)
        .where(Canvas.id == canvas_id, Canvas.project_id == project_id)
        .options(selectinload(Canvas.components))
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found")

    # Deserialize tldraw_snapshot from JSON text
    snapshot = None
    if canvas.tldraw_snapshot:
        snapshot = json.loads(canvas.tldraw_snapshot)

    components = [_component_response(comp) for comp in canvas.components]

    return CanvasDetailResponse(
        id=canvas.id,
        project_id=canvas.project_id,
        name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id,
        created_by=canvas.created_by,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
        component_count=len(canvas.components),
        tldraw_snapshot=snapshot,
        components=components,
    )


@router.patch("/{canvas_id}", response_model=CanvasDetailResponse)
async def update_canvas(
    project_id: str,
    canvas_id: str,
    body: CanvasUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update canvas name or tldraw snapshot. Requires editor role."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(Canvas)
        .where(Canvas.id == canvas_id, Canvas.project_id == project_id)
        .options(selectinload(Canvas.components))
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found")

    if body.name is not None:
        canvas.name = body.name
    if body.tldraw_snapshot is not None:
        canvas.tldraw_snapshot = json.dumps(body.tldraw_snapshot)

    await db.flush()

    snapshot = None
    if canvas.tldraw_snapshot:
        snapshot = json.loads(canvas.tldraw_snapshot)

    components = [_component_response(comp) for comp in canvas.components]

    return CanvasDetailResponse(
        id=canvas.id,
        project_id=canvas.project_id,
        name=canvas.name,
        yjs_doc_id=canvas.yjs_doc_id,
        created_by=canvas.created_by,
        created_at=canvas.created_at,
        updated_at=canvas.updated_at,
        component_count=len(canvas.components),
        tldraw_snapshot=snapshot,
        components=components,
    )


@router.post("/{canvas_id}/components", response_model=ComponentResponse, status_code=status.HTTP_201_CREATED)
async def add_component(
    project_id: str,
    canvas_id: str,
    body: ComponentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a component to a canvas. Requires editor role."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    # Verify canvas exists in project
    result = await db.execute(
        select(Canvas).where(Canvas.id == canvas_id, Canvas.project_id == project_id)
    )
    canvas = result.scalar_one_or_none()
    if not canvas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canvas not found")

    metadata_str = None
    if body.metadata_json is not None:
        metadata_str = json.dumps(body.metadata_json)

    component = CanvasComponent(
        id=str(uuid.uuid4()),
        canvas_id=canvas_id,
        shape_id=body.shape_id,
        name=body.name,
        component_type=body.component_type,
        tech_stack=body.tech_stack,
        description=body.description,
        metadata_json=metadata_str,
    )
    db.add(component)
    await db.flush()

    # Sync component to Knowledge Graph in background
    await enqueue("component-to-kg", _sync_component_to_knowledge, component.id, project_id)

    return _component_response(component)


@router.delete("/{canvas_id}/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_component(
    project_id: str,
    canvas_id: str,
    component_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a component from a canvas. Requires editor role."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(CanvasComponent).where(
            CanvasComponent.id == component_id,
            CanvasComponent.canvas_id == canvas_id,
        )
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")

    await db.delete(component)
    await db.flush()
