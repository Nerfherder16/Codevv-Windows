"""AI chat endpoint — SSE streaming via Anthropic SDK + OAuth auth endpoints."""

import json
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import get_settings
from app.core.claude_auth import get_claude_auth
from app.models.user import User
from app.api.routes.projects import get_project_with_access
from app.schemas.ai import ChatRequest, SessionResponse, ModelInfo
from app.services.claude_service import get_claude_service

logger = structlog.get_logger()

router = APIRouter(tags=["ai"])

# ── Auth endpoints (no project scope) ─────────────────────────────────────

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.get("/claude-status")
async def claude_auth_status():
    """Check if Claude credentials exist (API key or OAuth)."""
    settings = get_settings()
    if settings.anthropic_api_key:
        return {"authenticated": True, "method": "api_key"}
    auth = get_claude_auth()
    status = auth.get_status()
    if status.get("authenticated"):
        status["method"] = "oauth"
    return status


@auth_router.post("/claude-login")
async def claude_login():
    """Start PKCE OAuth flow. Returns auth URL for the browser."""
    auth = get_claude_auth()
    return auth.start_login()


@auth_router.get("/claude-callback")
async def claude_callback(code: str = Query(...), state: str = Query(...)):
    """Handle OAuth callback from Anthropic. Browser redirects here."""
    auth = get_claude_auth()
    try:
        result = await auth.handle_callback(code, state)
        # Return a simple HTML page that closes itself / shows success
        return HTMLResponse(
            "<html><body><h2>Logged in to Claude!</h2>"
            "<p>You can close this tab and return to Foundry.</p>"
            "<script>window.close()</script></body></html>"
        )
    except Exception as e:
        logger.error("auth.callback_error", error=str(e))
        return HTMLResponse(
            f"<html><body><h2>Login failed</h2><p>{str(e)}</p></body></html>",
            status_code=400,
        )


# ── AI endpoints (project-scoped) ─────────────────────────────────────────

ai_router = APIRouter(prefix="/projects/{project_id}/ai", tags=["ai"])

AVAILABLE_MODELS = [
    ModelInfo(
        id="claude-opus-4-6",
        name="Claude Opus 4.6",
        description="Most capable model — deep reasoning, complex analysis",
    ),
    ModelInfo(
        id="claude-sonnet-4-5-20250929",
        name="Claude Sonnet 4.5",
        description="Fast and capable — good balance of speed and quality",
    ),
    ModelInfo(
        id="claude-haiku-4-5-20251001",
        name="Claude Haiku 4.5",
        description="Fastest model — quick answers, lower cost",
    ),
]


def _build_message(body: ChatRequest) -> str:
    """Augment the user message with page context hints."""
    parts = [body.message]
    if body.context:
        ctx = body.context
        if ctx.page:
            parts.append(f"\n[User is on the '{ctx.page}' page]")
        if ctx.canvas_id:
            parts.append(f"[Current canvas: {ctx.canvas_id}]")
        if ctx.component_id:
            parts.append(f"[Selected component: {ctx.component_id}]")
        if ctx.idea_id:
            parts.append(f"[Viewing idea: {ctx.idea_id}]")
    return "\n".join(parts)


async def _stream_events(
    project_id: str,
    user_id: str,
    body: ChatRequest,
    project_slug: str,
    project_name: str,
    db: AsyncSession,
):
    """Async generator that yields SSE-formatted events from Claude."""
    service = get_claude_service()
    message = _build_message(body)

    async for event in service.chat(
        project_id=project_id,
        project_slug=project_slug,
        project_name=project_name,
        user_id=user_id,
        message=message,
        model=body.model,
        db=db,
    ):
        event_type = event.get("type", "")

        if event_type == "text":
            yield f"event: text\ndata: {json.dumps({'text': event['text']})}\n\n"

        elif event_type == "tool_use_start":
            yield f"event: tool_use\ndata: {json.dumps({'name': event['name'], 'status': 'starting'})}\n\n"

        elif event_type == "tool_use":
            yield f"event: tool_use\ndata: {json.dumps({'name': event['name'], 'input': event.get('input', {})})}\n\n"

        elif event_type == "done":
            yield f"event: done\ndata: {json.dumps({'model': event.get('model', '')})}\n\n"

        elif event_type == "error":
            yield f"event: error\ndata: {json.dumps({'message': event.get('message', 'Unknown error')})}\n\n"


@ai_router.post("/chat")
async def chat_stream(
    project_id: str,
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE endpoint — streams Claude responses token-by-token."""
    project = await get_project_with_access(project_id, user, db)

    # Check auth before streaming — API key or OAuth
    settings = get_settings()
    if not settings.anthropic_api_key:
        auth = get_claude_auth()
        if not auth.has_credentials():
            raise HTTPException(
                status_code=401,
                detail="No API key set and no OAuth credentials. Set ANTHROPIC_API_KEY in .env or log in via OAuth.",
            )

    return StreamingResponse(
        _stream_events(project_id, user.id, body, project.slug, project.name, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@ai_router.get("/session", response_model=SessionResponse)
async def get_session(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current AI session status."""
    await get_project_with_access(project_id, user, db)

    service = get_claude_service()
    history = service.get_history(user.id, project_id)
    settings = get_settings()
    if history:
        return SessionResponse(
            active=True,
            model=settings.claude_model,
            project_id=project_id,
        )
    return SessionResponse(active=False)


@ai_router.delete("/session")
async def close_session(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear conversation history for this user+project."""
    await get_project_with_access(project_id, user, db)

    service = get_claude_service()
    service.clear_history(user.id, project_id)
    return {"status": "cleared"}


@ai_router.get("/models", response_model=list[ModelInfo])
async def list_models():
    """Return available Claude models."""
    return AVAILABLE_MODELS


# Combine both routers into a single one for the main app
router.include_router(auth_router)
router.include_router(ai_router)
