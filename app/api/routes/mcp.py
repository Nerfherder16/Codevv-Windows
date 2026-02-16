"""MCP server management endpoints."""

import structlog
from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.models.user import User
from app.services.mcp_manager import get_mcp_manager

logger = structlog.get_logger()

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/servers")
async def list_servers(user: User = Depends(get_current_user)):
    """List all available MCP servers and their connection status."""
    mgr = get_mcp_manager()
    return mgr.get_available_servers()


@router.post("/servers/{name}/connect")
async def connect_server(name: str, user: User = Depends(get_current_user)):
    """Connect to an MCP server by name."""
    mgr = get_mcp_manager()
    result = await mgr.connect_server(name)
    return result


@router.post("/servers/{name}/disconnect")
async def disconnect_server(name: str, user: User = Depends(get_current_user)):
    """Disconnect from an MCP server."""
    mgr = get_mcp_manager()
    await mgr.disconnect_server(name)
    return {"name": name, "status": "disconnected"}


@router.get("/servers/{name}/tools")
async def server_tools(name: str, user: User = Depends(get_current_user)):
    """Get tools available on a specific MCP server."""
    mgr = get_mcp_manager()
    tools = mgr.get_server_tools(name)
    return {"name": name, "tools": tools}


@router.post("/servers/refresh")
async def refresh_configs(user: User = Depends(get_current_user)):
    """Reload MCP server configs from ~/.claude.json."""
    mgr = get_mcp_manager()
    configs = mgr.load_configs()
    return {"server_count": len(configs), "servers": list(configs.keys())}
