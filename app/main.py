import sys
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.config import get_settings
from app.core.database import init_db
from app.api.routes import auth, projects, canvases, ideas, scaffold, knowledge, video, deploy, ai, mcp, conversations, workspaces
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ]
)

settings = get_settings()
logger = structlog.get_logger()


def get_static_dir() -> Path:
    """Find the static directory — works both in dev and frozen exe."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "static"
    return Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", app=settings.app_name)
    await init_db()

    # Check Recall health
    try:
        from app.core.recall_client import get_recall_client
        recall = get_recall_client()
        health = await recall.health()
        logger.info("recall.connected", status=health.get("status"))
    except Exception as e:
        logger.warning("recall.unavailable", error=str(e))

    yield

    # Shutdown MCP connections
    try:
        from app.services.mcp_manager import get_mcp_manager
        await get_mcp_manager().shutdown()
    except Exception as e:
        logger.warning("mcp.shutdown_error", error=str(e))

    logger.info("shutdown")


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(canvases.router, prefix="/api")
app.include_router(ideas.router, prefix="/api")
app.include_router(scaffold.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(video.router, prefix="/api")
app.include_router(deploy.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(mcp.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(workspaces.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


@app.get("/api/services/status")
async def services_status():
    """Health check for external services: Ollama, Recall, Claude."""
    import httpx
    from app.core.recall_client import get_recall_client
    from app.core.claude_auth import get_claude_auth

    results: dict = {}

    # Ollama
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_url}/api/tags")
            results["ollama"] = {"status": "connected", "url": settings.ollama_url}
    except Exception as e:
        results["ollama"] = {"status": "unavailable", "url": settings.ollama_url, "error": str(e)}

    # Recall
    try:
        recall = get_recall_client()
        await recall.health()
        results["recall"] = {"status": "connected", "url": settings.recall_url}
    except Exception as e:
        results["recall"] = {"status": "unavailable", "url": settings.recall_url, "error": str(e)}

    # LiveKit
    if settings.livekit_url:
        try:
            lk_http_url = settings.livekit_url.replace("ws://", "http://").replace("wss://", "https://")
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(lk_http_url)
                results["livekit"] = {"status": "connected", "url": settings.livekit_url}
        except Exception as e:
            results["livekit"] = {"status": "unavailable", "url": settings.livekit_url, "error": str(e)}

    # code-server
    if settings.code_server_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(settings.code_server_url)
                results["code_server"] = {"status": "connected", "url": settings.code_server_url}
        except Exception as e:
            results["code_server"] = {"status": "unavailable", "url": settings.code_server_url, "error": str(e)}

    # Claude
    if settings.anthropic_api_key:
        results["claude"] = {"status": "connected", "method": "api_key"}
    else:
        try:
            auth = get_claude_auth()
            status = auth.get_status()
            if status.get("authenticated"):
                results["claude"] = {"status": "connected", "method": "oauth"}
            else:
                results["claude"] = {"status": "not_authenticated"}
        except Exception:
            results["claude"] = {"status": "not_configured"}

    return results


# Serve frontend static files
static_dir = get_static_dir()
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Serve index.html for all non-API routes (SPA client-side routing)
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(static_dir / "index.html"))


def main():
    import uvicorn
    import webbrowser
    import threading

    url = f"http://{settings.host}:{settings.port}"
    if settings.open_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    print(f"\n  Foundry running at {url}\n")
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
