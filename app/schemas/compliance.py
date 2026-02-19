from pydantic import BaseModel
from datetime import datetime


class ChecklistCreate(BaseModel):
    name: str
    description: str | None = None


class CheckCreate(BaseModel):
    title: str
    description: str | None = None
    category: str = "security"


class CheckUpdate(BaseModel):
    status: str | None = None
    evidence_url: str | None = None
    notes: str | None = None
    assigned_to: str | None = None


class ComplianceCheckResponse(BaseModel):
    id: str
    checklist_id: str
    title: str
    description: str | None
    category: str
    status: str
    evidence_url: str | None
    notes: str | None
    assigned_to: str | None
    updated_by: str | None
    updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str | None
    checks_count: int = 0
    pass_rate: float = 0.0
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChecklistDetailResponse(ChecklistResponse):
    checks: list[ComplianceCheckResponse] = []


class LaunchReadinessResponse(BaseModel):
    overall_score: float
    category_scores: dict[str, float] = {}
    blockers: list[ComplianceCheckResponse] = []
    total: int
    passed: int
    failed: int
