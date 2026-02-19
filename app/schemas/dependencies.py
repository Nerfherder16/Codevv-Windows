from pydantic import BaseModel


class DependencyNodeResponse(BaseModel):
    id: str
    name: str
    component_type: str
    tech_stack: str | None = None
    canvas_id: str | None = None


class DependencyEdgeResponse(BaseModel):
    source: str
    target: str
    relation_type: str
    weight: float | None = None


class DependencyGraphStats(BaseModel):
    node_count: int
    edge_count: int
    max_depth: int


class DependencyGraphResponse(BaseModel):
    nodes: list[DependencyNodeResponse]
    edges: list[DependencyEdgeResponse]
    stats: DependencyGraphStats


class ImpactResponse(BaseModel):
    impact_count: int
