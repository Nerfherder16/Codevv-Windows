from pydantic import BaseModel
from datetime import datetime


class EnvironmentCreate(BaseModel):
    name: str
    config_json: dict | None = None


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    config_json: dict | None = None
    compose_yaml: str | None = None


class EnvironmentResponse(BaseModel):
    id: str
    project_id: str
    name: str
    config_json: dict | None
    compose_yaml: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeployRequest(BaseModel):
    environment_id: str


class DeployJobResponse(BaseModel):
    id: str
    environment_id: str
    status: str
    logs: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class GenerateComposeRequest(BaseModel):
    canvas_id: str
    environment_name: str = "dev"
