from pydantic import BaseModel
from datetime import datetime


class AgentRunCreate(BaseModel):
    agent_type: str
    input_json: dict | None = None


class AgentFindingResponse(BaseModel):
    id: str
    run_id: str
    severity: str
    title: str
    description: str | None
    file_path: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentRunResponse(BaseModel):
    id: str
    project_id: str
    agent_type: str
    status: str
    input_json: dict | None = None
    output_json: dict | None = None
    error_message: str | None = None
    findings_count: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentRunDetailResponse(AgentRunResponse):
    findings: list[AgentFindingResponse] = []
