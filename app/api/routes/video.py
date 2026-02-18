from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User
from app.models.video import VideoRoom
from app.schemas.video import RoomCreate, RoomResponse, RoomTokenResponse
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/rooms", tags=["video"])
settings = get_settings()


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    project_id: str,
    body: RoomCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new video room for a project."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    room_id = str(uuid.uuid4())
    livekit_room_name = f"bh-{project_id[:8]}-{uuid.uuid4().hex[:8]}"

    room = VideoRoom(
        id=room_id,
        project_id=project_id,
        canvas_id=body.canvas_id,
        name=body.name,
        livekit_room_name=livekit_room_name,
        created_by=user.id,
    )
    db.add(room)
    await db.flush()

    return RoomResponse(
        id=room.id,
        project_id=room.project_id,
        canvas_id=room.canvas_id,
        name=room.name,
        livekit_room_name=room.livekit_room_name,
        is_active=room.is_active,
        created_by=room.created_by,
        created_at=room.created_at,
    )


@router.get("", response_model=list[RoomResponse])
async def list_rooms(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active video rooms in a project."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.project_id == project_id,
            VideoRoom.is_active == True,
        )
    )
    rooms = result.scalars().all()

    return [
        RoomResponse(
            id=r.id,
            project_id=r.project_id,
            canvas_id=r.canvas_id,
            name=r.name,
            livekit_room_name=r.livekit_room_name,
            is_active=r.is_active,
            created_by=r.created_by,
            created_at=r.created_at,
        )
        for r in rooms
    ]


@router.post("/{room_id}/token", response_model=RoomTokenResponse)
async def get_room_token(
    project_id: str,
    room_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a LiveKit JWT token, or return desktop-mode fallback."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.id == room_id,
            VideoRoom.project_id == project_id,
        )
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    if not room.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room is not active")

    # Real LiveKit token if configured
    if settings.livekit_api_key and settings.livekit_api_secret:
        from livekit import api as lk_api

        token = (
            lk_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
            .with_identity(str(user.id))
            .with_name(user.display_name)
            .with_grants(
                lk_api.VideoGrants(
                    room_join=True,
                    room=room.livekit_room_name,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
        )

        return RoomTokenResponse(
            token=token.to_jwt(),
            room_name=room.livekit_room_name,
            url=settings.livekit_url,
        )

    # Desktop-mode fallback
    return RoomTokenResponse(
        token="desktop-mode",
        room_name=room.livekit_room_name,
        url="ws://localhost:7880",
    )


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def close_room(
    project_id: str,
    room_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Close a video room by setting is_active to False."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(VideoRoom).where(
            VideoRoom.id == room_id,
            VideoRoom.project_id == project_id,
        )
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    room.is_active = False
    await db.flush()
