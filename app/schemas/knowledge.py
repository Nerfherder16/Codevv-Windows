from pydantic import BaseModel
from datetime import datetime


class EntityCreate(BaseModel):
    name: str
    entity_type: str
    description: str | None = None
    path: str | None = None
    metadata_json: dict | None = None


class EntityUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    path: str | None = None
    metadata_json: dict | None = None


class RelationCreate(BaseModel):
    source_id: str
    target_id: str
    relation_type: str
    weight: float = 1.0
    metadata_json: dict | None = None


class EntityResponse(BaseModel):
    id: str
    project_id: str
    name: str
    entity_type: str
    description: str | None
    path: str | None
    metadata_json: dict | None
    source_type: str | None
    source_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RelationResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: str
    weight: float | None
    metadata_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GraphTraversalRequest(BaseModel):
    start_id: str
    max_depth: int = 3
    relation_types: list[str] | None = None


class GraphNode(BaseModel):
    id: str
    name: str
    entity_type: str
    depth: int


class GraphEdge(BaseModel):
    source: str
    target: str
    relation_type: str
    weight: float | None


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class SemanticSearchRequest(BaseModel):
    query: str
    limit: int = 20
    entity_type: str | None = None
