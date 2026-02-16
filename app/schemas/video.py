from pydantic import BaseModel
from datetime import datetime


class RoomCreate(BaseModel):
    name: str
    canvas_id: str | None = None


class RoomResponse(BaseModel):
    id: str
    project_id: str
    canvas_id: str | None
    name: str
    livekit_room_name: str
    is_active: bool
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomTokenResponse(BaseModel):
    token: str
    room_name: str
    url: str
