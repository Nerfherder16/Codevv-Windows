from pydantic import BaseModel
from datetime import datetime


class ScaffoldRequest(BaseModel):
    canvas_id: str
    component_ids: list[str]


class ScaffoldApproval(BaseModel):
    approved: bool


class ScaffoldResponse(BaseModel):
    id: str
    project_id: str
    canvas_id: str
    component_ids: list[str]
    status: str
    spec_json: dict | None
    generated_files: dict | None
    error_message: str | None
    created_by: str
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
