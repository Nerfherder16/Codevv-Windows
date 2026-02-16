from pydantic import BaseModel
from datetime import datetime


class IdeaCreate(BaseModel):
    title: str
    description: str
    category: str | None = None


class IdeaUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    category: str | None = None


class IdeaVoteRequest(BaseModel):
    value: int


class IdeaCommentCreate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: str
    user_id: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class IdeaResponse(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    status: str
    category: str | None
    feasibility_score: float | None
    feasibility_reason: str | None
    vote_count: int = 0
    comment_count: int = 0
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class IdeaDetailResponse(IdeaResponse):
    comments: list[CommentResponse] = []


class IdeaSearchRequest(BaseModel):
    query: str
    limit: int = 20
