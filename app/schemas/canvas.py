from pydantic import BaseModel
from datetime import datetime


class CanvasCreate(BaseModel):
    name: str


class CanvasUpdate(BaseModel):
    name: str | None = None
    tldraw_snapshot: dict | None = None


class ComponentCreate(BaseModel):
    shape_id: str
    name: str
    component_type: str
    tech_stack: str | None = None
    description: str | None = None
    metadata_json: dict | None = None


class ComponentResponse(BaseModel):
    id: str
    canvas_id: str
    shape_id: str
    name: str
    component_type: str
    tech_stack: str | None
    description: str | None
    metadata_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CanvasResponse(BaseModel):
    id: str
    project_id: str
    name: str
    yjs_doc_id: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    component_count: int = 0

    model_config = {"from_attributes": True}


class CanvasDetailResponse(CanvasResponse):
    tldraw_snapshot: dict | None = None
    components: list[ComponentResponse] = []
