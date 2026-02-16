from pydantic import BaseModel


class ChatContext(BaseModel):
    page: str | None = None
    component_id: str | None = None
    idea_id: str | None = None
    canvas_id: str | None = None


class ChatRequest(BaseModel):
    message: str
    context: ChatContext | None = None
    model: str | None = None


class SessionResponse(BaseModel):
    active: bool
    session_id: str | None = None
    model: str | None = None
    project_id: str | None = None


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str
