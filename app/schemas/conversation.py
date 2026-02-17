from pydantic import BaseModel
from datetime import datetime


class ConversationResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    title: str
    model: str | None
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationMessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    tool_uses_json: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailResponse(ConversationResponse):
    messages: list[ConversationMessageResponse] = []


class ConversationRename(BaseModel):
    title: str
