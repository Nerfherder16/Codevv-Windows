"""Claude service — direct Anthropic API calls with in-process tool execution."""

from __future__ import annotations

import json
from typing import AsyncIterator

import anthropic
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.claude_auth import get_claude_auth, ClaudeAuth
from app.core.config import get_settings
from app.core.recall_client import get_recall_client
from app.models.project import Project, ProjectMember
from app.models.canvas import Canvas, CanvasComponent
from app.models.idea import Idea
from app.models.scaffold import ScaffoldJob
from app.models.deploy import Environment

logger = structlog.get_logger()

# ── Anthropic tool definitions (matches MCP server tools) ──────────────────

TOOLS = [
    {
        "name": "get_project_summary",
        "description": "Get project overview including member count, canvas count, idea count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "The project UUID"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_canvas_components",
        "description": "Get all components on a canvas with their types, tech stacks, and descriptions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "canvas_id": {"type": "string"},
            },
            "required": ["project_id", "canvas_id"],
        },
    },
    {
        "name": "list_canvases",
        "description": "List all canvases in a project with their names and component counts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_ideas",
        "description": "Get ideas in a project, optionally filtered by status (draft/proposed/approved/rejected/implemented).",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "status": {"type": "string", "description": "Filter by status. Optional."},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "search_ideas",
        "description": "Search across ideas in a project by keyword.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["project_id", "query"],
        },
    },
    {
        "name": "get_scaffold_job",
        "description": "Get scaffold job details including generated files and status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
                "job_id": {"type": "string"},
            },
            "required": ["project_id", "job_id"],
        },
    },
    {
        "name": "get_deploy_config",
        "description": "Get deployment environments with Docker Compose and env configuration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string"},
            },
            "required": ["project_id"],
        },
    },
    {
        "name": "get_knowledge_context",
        "description": "Get assembled knowledge context from Recall for a given query and project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_slug": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
]


# ── Tool execution (direct Python, same process) ──────────────────────────

def _safe_json(val: str | None) -> dict | list | None:
    """Parse a JSON text column, returning None on failure."""
    if not val:
        return None
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return None


async def _tool_get_project_summary(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.members))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        return json.dumps({"error": "Project not found"})

    canvas_count = (await db.execute(
        select(func.count()).select_from(Canvas).where(Canvas.project_id == project_id)
    )).scalar() or 0

    idea_count = (await db.execute(
        select(func.count()).select_from(Idea).where(Idea.project_id == project_id)
    )).scalar() or 0

    return json.dumps({
        "id": project.id,
        "name": project.name,
        "slug": project.slug,
        "description": project.description,
        "member_count": len(project.members),
        "canvas_count": canvas_count,
        "idea_count": idea_count,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    })


async def _tool_get_canvas_components(project_id: str, canvas_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(CanvasComponent).where(
            CanvasComponent.canvas_id == canvas_id,
        )
    )
    components = result.scalars().all()
    return json.dumps([
        {
            "id": c.id,
            "shape_id": c.shape_id,
            "name": c.name,
            "component_type": c.component_type,
            "tech_stack": c.tech_stack,
            "description": c.description,
            "metadata": _safe_json(c.metadata_json),
        }
        for c in components
    ])


async def _tool_list_canvases(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Canvas).where(Canvas.project_id == project_id)
    )
    canvases = result.scalars().all()
    out = []
    for c in canvases:
        comp_count = (await db.execute(
            select(func.count()).select_from(CanvasComponent)
            .where(CanvasComponent.canvas_id == c.id)
        )).scalar() or 0
        out.append({
            "id": c.id,
            "name": c.name,
            "component_count": comp_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return json.dumps(out)


async def _tool_get_ideas(project_id: str, db: AsyncSession, status: str | None = None) -> str:
    q = select(Idea).where(Idea.project_id == project_id)
    if status:
        q = q.where(Idea.status == status)
    q = q.order_by(Idea.created_at.desc())
    result = await db.execute(q)
    ideas = result.scalars().all()
    return json.dumps([
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "status": i.status,
            "category": i.category,
            "feasibility_score": i.feasibility_score,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in ideas
    ])


async def _tool_search_ideas(project_id: str, query: str, db: AsyncSession) -> str:
    # Simple ILIKE search (same as REST endpoint)
    pattern = f"%{query}%"
    result = await db.execute(
        select(Idea)
        .where(Idea.project_id == project_id)
        .where((Idea.title.ilike(pattern)) | (Idea.description.ilike(pattern)))
        .order_by(Idea.created_at.desc())
        .limit(20)
    )
    ideas = result.scalars().all()
    return json.dumps([
        {
            "id": i.id,
            "title": i.title,
            "description": i.description[:200] if i.description else "",
            "status": i.status,
            "category": i.category,
        }
        for i in ideas
    ])


async def _tool_get_scaffold_job(project_id: str, job_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(ScaffoldJob).where(
            ScaffoldJob.id == job_id,
            ScaffoldJob.project_id == project_id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        return json.dumps({"error": "Scaffold job not found"})
    return json.dumps({
        "id": job.id,
        "status": job.status,
        "component_ids": _safe_json(job.component_ids),
        "spec": _safe_json(job.spec_json),
        "generated_files": _safe_json(job.generated_files),
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    })


async def _tool_get_deploy_config(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Environment).where(Environment.project_id == project_id)
    )
    envs = result.scalars().all()
    return json.dumps([
        {
            "id": e.id,
            "name": e.name,
            "config": _safe_json(e.config_json),
            "compose_yaml": e.compose_yaml,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in envs
    ])


async def _tool_get_knowledge_context(project_slug: str, query: str) -> str:
    recall = get_recall_client()
    domain = f"foundry:{project_slug}" if project_slug else None
    try:
        context = await recall.get_context(query=query, max_tokens=2000)
        return context if context else json.dumps({"result": "No knowledge found for this query."})
    except Exception as e:
        return json.dumps({"error": str(e)})


async def _execute_tool(
    name: str,
    tool_input: dict,
    project_id: str,
    project_slug: str,
    db: AsyncSession,
) -> str:
    """Dispatch a tool call to the appropriate Python function."""
    try:
        match name:
            case "get_project_summary":
                return await _tool_get_project_summary(tool_input.get("project_id", project_id), db)
            case "get_canvas_components":
                return await _tool_get_canvas_components(
                    tool_input.get("project_id", project_id),
                    tool_input["canvas_id"],
                    db,
                )
            case "list_canvases":
                return await _tool_list_canvases(tool_input.get("project_id", project_id), db)
            case "get_ideas":
                return await _tool_get_ideas(
                    tool_input.get("project_id", project_id),
                    db,
                    status=tool_input.get("status"),
                )
            case "search_ideas":
                return await _tool_search_ideas(
                    tool_input.get("project_id", project_id),
                    tool_input["query"],
                    db,
                )
            case "get_scaffold_job":
                return await _tool_get_scaffold_job(
                    tool_input.get("project_id", project_id),
                    tool_input["job_id"],
                    db,
                )
            case "get_deploy_config":
                return await _tool_get_deploy_config(tool_input.get("project_id", project_id), db)
            case "get_knowledge_context":
                return await _tool_get_knowledge_context(
                    tool_input.get("project_slug", project_slug),
                    tool_input["query"],
                )
            case _:
                return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        logger.error("tool.execution_error", tool=name, error=str(e))
        return json.dumps({"error": f"Tool execution failed: {str(e)}"})


# ── System prompt ──────────────────────────────────────────────────────────

def _build_system_prompt(project_name: str, project_slug: str, project_id: str) -> str:
    return (
        f"You are the AI assistant for Foundry, a collaborative software design tool.\n"
        f"You have tools to query project data and knowledge memory.\n"
        f"Current project: {project_name} (slug: {project_slug}, id: {project_id})\n"
        f'Recall domain for this project: foundry:{project_slug}\n'
        f"When tools require project_id, use: {project_id}\n"
        f"When tools require project_slug, use: {project_slug}\n"
        f"When the user asks about architecture, use both canvas tools and knowledge tools.\n"
        f"Be concise and helpful. Use markdown for formatting."
    )


# ── Main service ───────────────────────────────────────────────────────────

class ClaudeService:
    """Manages conversations and Anthropic API calls."""

    def __init__(self):
        # Conversation history keyed by "user_id:project_id"
        self._conversations: dict[str, list[dict]] = {}

    def _key(self, user_id: str, project_id: str) -> str:
        return f"{user_id}:{project_id}"

    def get_history(self, user_id: str, project_id: str) -> list[dict]:
        return self._conversations.get(self._key(user_id, project_id), [])

    def clear_history(self, user_id: str, project_id: str) -> None:
        self._conversations.pop(self._key(user_id, project_id), None)

    async def chat(
        self,
        project_id: str,
        project_slug: str,
        project_name: str,
        user_id: str,
        message: str,
        model: str | None,
        db: AsyncSession,
    ) -> AsyncIterator[dict]:
        """Stream a chat response. Yields SSE-ready dicts."""
        settings = get_settings()

        # Create client: prefer API key, fall back to OAuth token
        if settings.anthropic_api_key:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            extra_headers = {}
        else:
            auth = get_claude_auth()
            access_token = await auth.get_access_token()
            # OAuth tokens require the beta header — this is how Claude Code does it
            extra_headers = {
                "anthropic-beta": ClaudeAuth.get_beta_header(),
            }
            client = anthropic.AsyncAnthropic(
                auth_token=access_token,
                default_headers=extra_headers,
            )

        chosen_model = model or settings.claude_model
        system_prompt = _build_system_prompt(project_name, project_slug, project_id)

        # Get or init conversation history
        key = self._key(user_id, project_id)
        if key not in self._conversations:
            self._conversations[key] = []
        messages = self._conversations[key]

        # Append user message
        messages.append({"role": "user", "content": message})

        max_turns = settings.claude_max_turns
        turn = 0

        try:
            while turn < max_turns:
                turn += 1

                # Stream response from Anthropic
                async with client.messages.stream(
                    model=chosen_model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                    tools=TOOLS,
                ) as stream:
                    # Collect the full response for history
                    collected_content = []
                    tool_uses = []

                    async for event in stream:
                        if event.type == "content_block_start":
                            block = event.content_block
                            if block.type == "text":
                                # Text block starting
                                pass
                            elif block.type == "tool_use":
                                tool_uses.append({
                                    "id": block.id,
                                    "name": block.name,
                                    "input": {},
                                })
                                yield {
                                    "type": "tool_use_start",
                                    "name": block.name,
                                    "tool_use_id": block.id,
                                }

                        elif event.type == "content_block_delta":
                            delta = event.delta
                            if delta.type == "text_delta":
                                yield {"type": "text", "text": delta.text}
                            elif delta.type == "input_json_delta":
                                # Tool input being streamed — we accumulate it
                                pass

                        elif event.type == "content_block_stop":
                            pass

                    # Get the final message
                    response = await stream.get_final_message()

                # Build content blocks for history
                for block in response.content:
                    if block.type == "text":
                        collected_content.append({
                            "type": "text",
                            "text": block.text,
                        })
                    elif block.type == "tool_use":
                        collected_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })

                # Append assistant message to history
                messages.append({"role": "assistant", "content": collected_content})

                # If stop_reason is "end_turn", we're done
                if response.stop_reason == "end_turn":
                    break

                # If stop_reason is "tool_use", execute tools and continue
                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            yield {
                                "type": "tool_use",
                                "name": block.name,
                                "input": block.input,
                            }

                            logger.info(
                                "tool.executing",
                                tool=block.name,
                                input_keys=list(block.input.keys()),
                            )
                            result = await _execute_tool(
                                block.name, block.input,
                                project_id, project_slug, db,
                            )

                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            })

                    # Append tool results to messages
                    messages.append({"role": "user", "content": tool_results})
                    continue

                # Any other stop reason — we're done
                break

            yield {"type": "done", "model": chosen_model}

        except anthropic.AuthenticationError as e:
            logger.error("claude.auth_error", error=str(e))
            # Remove the user message we just appended since the call failed
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {"type": "error", "message": "Authentication failed. Token may have expired — try refreshing."}

        except anthropic.RateLimitError as e:
            logger.warning("claude.rate_limit", error=str(e))
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {"type": "error", "message": "Rate limited. Please wait a moment and try again."}

        except Exception as e:
            logger.error("claude.error", error=str(e), error_type=type(e).__name__)
            # Clean up partial conversation state
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {"type": "error", "message": f"Claude API error: {str(e)}"}


_service: ClaudeService | None = None


def get_claude_service() -> ClaudeService:
    global _service
    if _service is None:
        _service = ClaudeService()
    return _service
