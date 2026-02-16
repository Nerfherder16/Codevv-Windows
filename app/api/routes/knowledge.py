from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation
from app.schemas.knowledge import (
    EntityCreate,
    EntityUpdate,
    RelationCreate,
    EntityResponse,
    RelationResponse,
    GraphTraversalRequest,
    GraphResponse,
    GraphNode,
    GraphEdge,
    SemanticSearchRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.embedding import get_embedding, embedding_to_json, embedding_from_json, cosine_similarity
from app.services.recall_knowledge import (
    store_knowledge,
    search_knowledge,
    get_knowledge_graph,
    migrate_project_knowledge,
)
from app.core.recall_client import get_recall_client
import uuid
import json
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/knowledge", tags=["knowledge"])


def _entity_response(entity: KnowledgeEntity) -> EntityResponse:
    """Build an EntityResponse, deserializing metadata_json from Text."""
    metadata = None
    if entity.metadata_json:
        metadata = json.loads(entity.metadata_json)
    return EntityResponse(
        id=entity.id,
        project_id=entity.project_id,
        name=entity.name,
        entity_type=entity.entity_type,
        description=entity.description,
        path=entity.path,
        metadata_json=metadata,
        source_type=entity.source_type,
        source_id=entity.source_id,
        created_at=entity.created_at,
    )


def _relation_response(rel: KnowledgeRelation) -> RelationResponse:
    """Build a RelationResponse, deserializing metadata_json from Text."""
    metadata = None
    if rel.metadata_json:
        metadata = json.loads(rel.metadata_json)
    return RelationResponse(
        id=rel.id,
        source_id=rel.source_id,
        target_id=rel.target_id,
        relation_type=rel.relation_type,
        weight=rel.weight,
        metadata_json=metadata,
        created_at=rel.created_at,
    )


@router.post("/entities", response_model=EntityResponse, status_code=status.HTTP_201_CREATED)
async def create_entity(
    project_id: str,
    body: EntityCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a knowledge entity and generate its embedding."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    # Generate embedding from name + description
    emb_json = None
    embed_text = body.name
    if body.description:
        embed_text = f"{body.name}: {body.description}"
    try:
        emb = await get_embedding(embed_text)
        emb_json = embedding_to_json(emb)
    except Exception as e:
        logger.warning("knowledge.embed_failed", error=str(e))

    metadata_str = None
    if body.metadata_json is not None:
        metadata_str = json.dumps(body.metadata_json)

    entity = KnowledgeEntity(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=body.name,
        entity_type=body.entity_type,
        description=body.description,
        path=body.path,
        metadata_json=metadata_str,
        embedding=emb_json,
    )
    db.add(entity)
    await db.flush()

    return _entity_response(entity)


@router.get("/entities", response_model=list[EntityResponse])
async def list_entities(
    project_id: str,
    entity_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all knowledge entities in a project, optionally filtered by type."""
    await get_project_with_access(project_id, user, db)

    query = select(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id)
    if entity_type:
        query = query.where(KnowledgeEntity.entity_type == entity_type)

    result = await db.execute(query.order_by(KnowledgeEntity.created_at.desc()))
    entities = result.scalars().all()

    return [_entity_response(e) for e in entities]


@router.patch("/entities/{entity_id}", response_model=EntityResponse)
async def update_entity(
    project_id: str,
    entity_id: str,
    body: EntityUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update entity fields. Re-embeds if name or description changed."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.id == entity_id,
            KnowledgeEntity.project_id == project_id,
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    text_changed = False
    if body.name is not None:
        entity.name = body.name
        text_changed = True
    if body.description is not None:
        entity.description = body.description
        text_changed = True
    if body.path is not None:
        entity.path = body.path
    if body.metadata_json is not None:
        entity.metadata_json = json.dumps(body.metadata_json)

    # Re-embed if text changed
    if text_changed:
        embed_text = entity.name
        if entity.description:
            embed_text = f"{entity.name}: {entity.description}"
        try:
            emb = await get_embedding(embed_text)
            entity.embedding = embedding_to_json(emb)
        except Exception as e:
            logger.warning("knowledge.re_embed_failed", entity_id=entity_id, error=str(e))

    await db.flush()
    return _entity_response(entity)


@router.delete("/entities/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity(
    project_id: str,
    entity_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an entity and all its related relations."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.id == entity_id,
            KnowledgeEntity.project_id == project_id,
        )
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")

    # Delete all relations where this entity is source or target
    rels = await db.execute(
        select(KnowledgeRelation).where(
            (KnowledgeRelation.source_id == entity_id)
            | (KnowledgeRelation.target_id == entity_id)
        )
    )
    for rel in rels.scalars().all():
        await db.delete(rel)

    await db.delete(entity)
    await db.flush()


@router.post("/relations", response_model=RelationResponse, status_code=status.HTTP_201_CREATED)
async def create_relation(
    project_id: str,
    body: RelationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a relation between two knowledge entities."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    # Verify both entities exist in this project
    for eid in (body.source_id, body.target_id):
        result = await db.execute(
            select(KnowledgeEntity).where(
                KnowledgeEntity.id == eid,
                KnowledgeEntity.project_id == project_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Entity {eid} not found in project",
            )

    metadata_str = None
    if body.metadata_json is not None:
        metadata_str = json.dumps(body.metadata_json)

    relation = KnowledgeRelation(
        id=str(uuid.uuid4()),
        project_id=project_id,
        source_id=body.source_id,
        target_id=body.target_id,
        relation_type=body.relation_type,
        weight=body.weight,
        metadata_json=metadata_str,
    )
    db.add(relation)
    await db.flush()

    return _relation_response(relation)


@router.get("/relations", response_model=list[RelationResponse])
async def list_relations(
    project_id: str,
    relation_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all relations in a project, optionally filtered by type."""
    await get_project_with_access(project_id, user, db)

    query = select(KnowledgeRelation).where(KnowledgeRelation.project_id == project_id)
    if relation_type:
        query = query.where(KnowledgeRelation.relation_type == relation_type)

    result = await db.execute(query.order_by(KnowledgeRelation.created_at.desc()))
    relations = result.scalars().all()

    return [_relation_response(r) for r in relations]


@router.post("/traverse", response_model=GraphResponse)
async def traverse_graph(
    project_id: str,
    body: GraphTraversalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Traverse the knowledge graph from a start entity using recursive CTE (SQLite compatible)."""
    await get_project_with_access(project_id, user, db)

    # Verify start entity exists
    result = await db.execute(
        select(KnowledgeEntity).where(
            KnowledgeEntity.id == body.start_id,
            KnowledgeEntity.project_id == project_id,
        )
    )
    start = result.scalar_one_or_none()
    if not start:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Start entity not found")

    # Build relation type filter clause
    type_filter = ""
    params = {"start_id": body.start_id, "project_id": project_id, "max_depth": body.max_depth}
    if body.relation_types:
        placeholders = ", ".join(f":rt_{i}" for i in range(len(body.relation_types)))
        type_filter = f"AND r.relation_type IN ({placeholders})"
        for i, rt in enumerate(body.relation_types):
            params[f"rt_{i}"] = rt

    # Recursive CTE — works in SQLite 3.8.3+
    cte_sql = f"""
    WITH RECURSIVE graph_walk(entity_id, depth) AS (
        SELECT :start_id, 0
        UNION
        SELECT
            CASE
                WHEN r.source_id = gw.entity_id THEN r.target_id
                ELSE r.source_id
            END,
            gw.depth + 1
        FROM graph_walk gw
        JOIN knowledge_relations r ON (
            r.source_id = gw.entity_id OR r.target_id = gw.entity_id
        )
        WHERE gw.depth < :max_depth
            AND r.project_id = :project_id
            {type_filter}
    )
    SELECT DISTINCT entity_id, MIN(depth) as depth
    FROM graph_walk
    GROUP BY entity_id
    """

    walk_result = await db.execute(text(cte_sql), params)
    visited = {row[0]: row[1] for row in walk_result.fetchall()}

    if not visited:
        return GraphResponse(nodes=[], edges=[])

    # Load entities for visited nodes
    entity_result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.id.in_(list(visited.keys())))
    )
    entities = {e.id: e for e in entity_result.scalars().all()}

    nodes = []
    for eid, depth in visited.items():
        e = entities.get(eid)
        if e:
            nodes.append(GraphNode(
                id=e.id,
                name=e.name,
                entity_type=e.entity_type,
                depth=depth,
            ))

    # Load edges between visited nodes
    edge_query = select(KnowledgeRelation).where(
        KnowledgeRelation.project_id == project_id,
        KnowledgeRelation.source_id.in_(list(visited.keys())),
        KnowledgeRelation.target_id.in_(list(visited.keys())),
    )
    if body.relation_types:
        edge_query = edge_query.where(KnowledgeRelation.relation_type.in_(body.relation_types))

    edge_result = await db.execute(edge_query)
    edges = [
        GraphEdge(
            source=r.source_id,
            target=r.target_id,
            relation_type=r.relation_type,
            weight=r.weight,
        )
        for r in edge_result.scalars().all()
    ]

    return GraphResponse(nodes=nodes, edges=edges)


@router.post("/search", response_model=list[EntityResponse])
async def semantic_search(
    project_id: str,
    body: SemanticSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search across knowledge entities using cosine similarity."""
    await get_project_with_access(project_id, user, db)

    try:
        query_emb = await get_embedding(body.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Embedding service unavailable: {e}",
        )

    query = select(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id)
    if body.entity_type:
        query = query.where(KnowledgeEntity.entity_type == body.entity_type)

    result = await db.execute(query)
    entities = result.scalars().all()

    scored = []
    for entity in entities:
        emb = embedding_from_json(entity.embedding)
        if emb is None:
            continue
        sim = cosine_similarity(query_emb, emb)
        scored.append((sim, entity))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[: body.limit]

    return [_entity_response(entity) for _, entity in top]


# ---------- Recall-backed endpoints ----------


@router.post("/migrate")
async def migrate_knowledge_to_recall(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One-time migration of project knowledge from SQLite to Recall."""
    project = await get_project_with_access(project_id, user, db, min_role="owner")
    result = await migrate_project_knowledge(db, project_id, project.slug)
    return result


@router.get("/recall-graph")
async def recall_graph(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Graph data from Recall for D3 visualization."""
    project = await get_project_with_access(project_id, user, db)
    data = await get_knowledge_graph(project.slug)
    return data


@router.post("/recall-search")
async def recall_search(
    project_id: str,
    body: SemanticSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search via Recall."""
    project = await get_project_with_access(project_id, user, db)
    results = await search_knowledge(project.slug, body.query, body.limit)
    return results
