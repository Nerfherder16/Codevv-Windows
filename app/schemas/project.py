from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    archived: bool | None = None


class ProjectMemberAdd(BaseModel):
    email: str
    role: str = "editor"


class MemberResponse(BaseModel):
    id: str
    user_id: str
    display_name: str
    email: str
    role: str
    joined_at: datetime


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    archived: bool
    created_by: str
    created_at: datetime
    updated_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    members: list[MemberResponse] = []
