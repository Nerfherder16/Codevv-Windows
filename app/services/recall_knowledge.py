"""Bridge between Foundry knowledge operations and Recall."""

from __future__ import annotations

import json
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.recall_client import get_recall_client
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation

logger = structlog.get_logger()


def _domain(project_slug: str) -> str:
    return f"foundry:{project_slug}"


async def store_knowledge(
    project_slug: str,
    name: str,
    entity_type: str,
    description: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Store a knowledge entity in Recall."""
    recall = get_recall_client()
    content = name
    if description:
        content = f"{name}: {description}"

    tags = [entity_type]
    if metadata:
        tags.extend(str(v) for v in metadata.values() if isinstance(v, str))

    result = await recall.store(
        content=content,
        memory_type="semantic",
        domain=_domain(project_slug),
        importance=0.6,
        tags=tags[:10],
    )
    return result


async def search_knowledge(
    project_slug: str, query: str, limit: int = 20
) -> list[dict]:
    """Search knowledge entities in Recall."""
    recall = get_recall_client()
    results = await recall.search(
        query=query,
        domain=_domain(project_slug),
        limit=limit,
    )
    return results


async def get_knowledge_graph(project_slug: str) -> dict:
    """Return {nodes, edges} for D3 visualization from Recall data."""
    recall = get_recall_client()
    results = await recall.browse(
        query="knowledge",
        domain=_domain(project_slug),
        limit=100,
    )

    nodes = []
    node_ids = set()
    for mem in results:
        mid = mem.get("id", "")
        if mid in node_ids:
            continue
        node_ids.add(mid)

        # Parse entity_type from tags
        tags = mem.get("tags", [])
        entity_type = tags[0] if tags else "concept"

        # Parse name from content (before the colon if present)
        content = mem.get("content", "")
        name = content.split(":")[0].strip() if ":" in content else content[:60]

        nodes.append({
            "id": mid,
            "name": name,
            "entity_type": entity_type,
            "depth": 0,
        })

    # Build edges from Recall relationships
    edges = []
    for mem in results:
        mid = mem.get("id", "")
        related = mem.get("relationships", [])
        for rel in related:
            target_id = rel.get("target_id", "")
            if target_id in node_ids:
                edges.append({
                    "source": mid,
                    "target": target_id,
                    "relation_type": rel.get("relationship_type", "relates_to"),
                    "weight": rel.get("strength", 1.0),
                })

    return {"nodes": nodes, "edges": edges}


async def migrate_project_knowledge(
    db: AsyncSession, project_id: str, project_slug: str
) -> dict:
    """One-time migration from SQLite knowledge to Recall."""
    recall = get_recall_client()
    domain = _domain(project_slug)

    # Load all entities
    result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id)
    )
    entities = result.scalars().all()

    # Load all relations
    result = await db.execute(
        select(KnowledgeRelation).where(KnowledgeRelation.project_id == project_id)
    )
    relations = result.scalars().all()

    migrated_entities = 0
    migrated_relations = 0
    entity_id_map: dict[str, str] = {}  # old_id -> recall_id

    for entity in entities:
        content = entity.name
        if entity.description:
            content = f"{entity.name}: {entity.description}"

        tags = [entity.entity_type]
        if entity.path:
            tags.append(entity.path)

        try:
            stored = await recall.store(
                content=content,
                memory_type="semantic",
                domain=domain,
                importance=0.6,
                tags=tags[:10],
            )
            recall_id = stored.get("id", "")
            entity_id_map[entity.id] = recall_id
            migrated_entities += 1
        except Exception as e:
            logger.warning("migrate.entity_failed", name=entity.name, error=str(e))

    for relation in relations:
        source_recall = entity_id_map.get(relation.source_id)
        target_recall = entity_id_map.get(relation.target_id)
        if not source_recall or not target_recall:
            continue

        try:
            await recall.create_relationship(
                source_id=source_recall,
                target_id=target_recall,
                rel_type=relation.relation_type,
                strength=relation.weight or 0.5,
            )
            migrated_relations += 1
        except Exception as e:
            logger.warning("migrate.relation_failed", error=str(e))

    logger.info(
        "migrate.complete",
        project_slug=project_slug,
        entities=migrated_entities,
        relations=migrated_relations,
    )
    return {
        "migrated_entities": migrated_entities,
        "migrated_relations": migrated_relations,
        "total_entities": len(entities),
        "total_relations": len(relations),
    }
