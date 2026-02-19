"""Dependency Map — builds a graph from canvas components and knowledge relations."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.canvas import Canvas, CanvasComponent
from app.models.knowledge import KnowledgeRelation, KnowledgeEntity
from app.schemas.dependencies import (
    DependencyGraphResponse,
    DependencyNodeResponse,
    DependencyEdgeResponse,
    DependencyGraphStats,
    ImpactResponse,
)
from app.api.routes.projects import get_project_with_access

router = APIRouter(prefix="/projects/{project_id}/dependencies", tags=["dependencies"])


@router.get("", response_model=DependencyGraphResponse)
async def get_dependency_graph(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    # Get all canvas components for this project
    result = await db.execute(
        select(CanvasComponent)
        .join(Canvas, CanvasComponent.canvas_id == Canvas.id)
        .where(Canvas.project_id == project_id)
    )
    components = result.scalars().all()

    # Get knowledge entities for this project
    result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id)
    )
    entities = result.scalars().all()

    # Build node map from both sources
    nodes: dict[str, DependencyNodeResponse] = {}
    for comp in components:
        nodes[comp.id] = DependencyNodeResponse(
            id=comp.id,
            name=comp.name,
            component_type=comp.component_type or "default",
            tech_stack=comp.tech_stack,
            canvas_id=comp.canvas_id,
        )
    for ent in entities:
        if ent.id not in nodes:
            nodes[ent.id] = DependencyNodeResponse(
                id=ent.id,
                name=ent.name,
                component_type=ent.entity_type or "default",
            )

    # Get relations (edges)
    node_ids = list(nodes.keys())
    edges: list[DependencyEdgeResponse] = []
    if node_ids:
        result = await db.execute(
            select(KnowledgeRelation).where(
                KnowledgeRelation.source_id.in_(node_ids)
                | KnowledgeRelation.target_id.in_(node_ids)
            )
        )
        relations = result.scalars().all()
        for rel in relations:
            if rel.source_id in nodes and rel.target_id in nodes:
                edges.append(
                    DependencyEdgeResponse(
                        source=rel.source_id,
                        target=rel.target_id,
                        relation_type=rel.relation_type,
                        weight=rel.weight,
                    )
                )

    # Calculate max depth via simple BFS
    adjacency: dict[str, list[str]] = {nid: [] for nid in nodes}
    for edge in edges:
        adjacency[edge.source].append(edge.target)

    max_depth = 0
    for start in nodes:
        visited: set[str] = set()
        queue = [(start, 0)]
        while queue:
            current, depth = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            max_depth = max(max_depth, depth)
            for neighbor in adjacency.get(current, []):
                if neighbor not in visited:
                    queue.append((neighbor, depth + 1))

    return DependencyGraphResponse(
        nodes=list(nodes.values()),
        edges=edges,
        stats=DependencyGraphStats(
            node_count=len(nodes),
            edge_count=len(edges),
            max_depth=max_depth,
        ),
    )


@router.get("/{component_id}/impact", response_model=ImpactResponse)
async def get_impact(
    project_id: str,
    component_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    # Find all transitive dependents
    result = await db.execute(
        select(KnowledgeRelation).where(KnowledgeRelation.source_id == component_id)
    )
    direct = result.scalars().all()

    visited: set[str] = {component_id}
    queue = [r.target_id for r in direct]
    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)
        result = await db.execute(
            select(KnowledgeRelation).where(KnowledgeRelation.source_id == current)
        )
        for rel in result.scalars().all():
            if rel.target_id not in visited:
                queue.append(rel.target_id)

    return ImpactResponse(impact_count=len(visited) - 1)


@router.get("/cycles")
async def detect_cycles(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[list[str]]:
    await get_project_with_access(project_id, user, db)

    # Get all entities for this project
    result = await db.execute(
        select(KnowledgeEntity.id).where(KnowledgeEntity.project_id == project_id)
    )
    entity_ids = set(row[0] for row in result.all())

    if not entity_ids:
        return []

    # Get relations
    result = await db.execute(
        select(KnowledgeRelation).where(KnowledgeRelation.source_id.in_(entity_ids))
    )
    relations = result.scalars().all()

    adjacency: dict[str, list[str]] = {eid: [] for eid in entity_ids}
    for rel in relations:
        if rel.target_id in entity_ids:
            adjacency[rel.source_id].append(rel.target_id)

    # DFS cycle detection
    cycles: list[list[str]] = []
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {eid: WHITE for eid in entity_ids}
    path: list[str] = []

    def dfs(node: str) -> None:
        color[node] = GRAY
        path.append(node)
        for neighbor in adjacency.get(node, []):
            if color[neighbor] == GRAY:
                idx = path.index(neighbor)
                cycles.append(path[idx:])
            elif color[neighbor] == WHITE:
                dfs(neighbor)
        path.pop()
        color[node] = BLACK

    for node in entity_ids:
        if color[node] == WHITE:
            dfs(node)

    return cycles
