from pydantic import BaseModel
from datetime import datetime


class AuditReportCreate(BaseModel):
    title: str
    sections: list[str] = []


class AuditSectionResponse(BaseModel):
    name: str
    items: list[str] = []
    score: int = 0
    notes: str | None = None


class AuditReportResponse(BaseModel):
    id: str
    project_id: str
    title: str
    report_json: dict | None = None
    status: str
    generated_by: str
    created_at: datetime

    model_config = {"from_attributes": True}
