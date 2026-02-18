from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
settings = get_settings()


@router.get("/config")
async def get_workspace_config():
    """Return code-server configuration for the workspaces feature."""
    is_configured = bool(settings.code_server_url)
    return {
        "code_server_url": settings.code_server_url,
        "is_configured": is_configured,
    }
