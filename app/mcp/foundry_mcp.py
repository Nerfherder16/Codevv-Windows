#!/usr/bin/env python3
"""
Standalone MCP server for Foundry.

Claude CLI spawns this as a subprocess (stdio transport).
It calls Foundry's REST API at FOUNDRY_URL to answer queries about
structured project data. Also proxies knowledge context from Recall.

Usage:
    FOUNDRY_URL=http://127.0.0.1:8000 PROJECT_ID=abc python foundry_mcp.py
"""

import os
import json
import httpx
from mcp.server.fastmcp import FastMCP

FOUNDRY_URL = os.environ.get("FOUNDRY_URL", "http://127.0.0.1:8000")
RECALL_URL = os.environ.get("RECALL_URL", "http://192.168.50.19:8200")
PROJECT_ID = os.environ.get("PROJECT_ID", "")

mcp = FastMCP("Foundry")

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


@mcp.tool()
async def get_project_summary(project_id: str = "") -> str:
    """Get project overview including member count, canvas count, idea count."""
    pid = project_id or PROJECT_ID
    if not pid:
        return json.dumps({"error": "No project_id provided"})
    client = await _get_client()
    resp = await client.get(f"{FOUNDRY_URL}/api/projects/{pid}")
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def get_canvas_components(
    project_id: str = "", canvas_id: str = ""
) -> str:
    """Get all components on a canvas with their types, tech stacks, and descriptions."""
    pid = project_id or PROJECT_ID
    if not pid or not canvas_id:
        return json.dumps({"error": "project_id and canvas_id are required"})
    client = await _get_client()
    resp = await client.get(
        f"{FOUNDRY_URL}/api/projects/{pid}/canvases/{canvas_id}"
    )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    data = resp.json()
    return json.dumps(data.get("components", []))


@mcp.tool()
async def list_canvases(project_id: str = "") -> str:
    """List all canvases in a project with their names and component counts."""
    pid = project_id or PROJECT_ID
    if not pid:
        return json.dumps({"error": "No project_id provided"})
    client = await _get_client()
    resp = await client.get(f"{FOUNDRY_URL}/api/projects/{pid}/canvases")
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def get_ideas(
    project_id: str = "", status: str = ""
) -> str:
    """Get ideas in a project, optionally filtered by status (draft/proposed/approved/rejected/implemented)."""
    pid = project_id or PROJECT_ID
    if not pid:
        return json.dumps({"error": "No project_id provided"})
    client = await _get_client()
    params = {}
    if status:
        params["status"] = status
    resp = await client.get(
        f"{FOUNDRY_URL}/api/projects/{pid}/ideas", params=params
    )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def search_ideas(project_id: str = "", query: str = "") -> str:
    """Semantic search across ideas in a project."""
    pid = project_id or PROJECT_ID
    if not pid or not query:
        return json.dumps({"error": "project_id and query are required"})
    client = await _get_client()
    resp = await client.post(
        f"{FOUNDRY_URL}/api/projects/{pid}/ideas/search",
        json={"query": query},
    )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def get_scaffold_job(
    project_id: str = "", job_id: str = ""
) -> str:
    """Get scaffold job details including generated files and status."""
    pid = project_id or PROJECT_ID
    if not pid or not job_id:
        return json.dumps({"error": "project_id and job_id are required"})
    client = await _get_client()
    resp = await client.get(
        f"{FOUNDRY_URL}/api/projects/{pid}/scaffold/jobs/{job_id}"
    )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def get_deploy_config(project_id: str = "") -> str:
    """Get deployment environments with Docker Compose and env configuration."""
    pid = project_id or PROJECT_ID
    if not pid:
        return json.dumps({"error": "No project_id provided"})
    client = await _get_client()
    resp = await client.get(
        f"{FOUNDRY_URL}/api/projects/{pid}/deploy/environments"
    )
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


@mcp.tool()
async def get_knowledge_context(
    project_slug: str = "", query: str = ""
) -> str:
    """Get assembled knowledge context from Recall for a given query and project."""
    if not query:
        return json.dumps({"error": "query is required"})
    client = await _get_client()
    domain = f"foundry:{project_slug}" if project_slug else None
    body: dict = {"query": query, "max_tokens": 2000}
    if domain:
        body["domain"] = domain
    resp = await client.post(f"{RECALL_URL}/search/context", json=body)
    if resp.status_code != 200:
        return json.dumps({"error": f"HTTP {resp.status_code}", "detail": resp.text})
    return json.dumps(resp.json())


if __name__ == "__main__":
    mcp.run()
