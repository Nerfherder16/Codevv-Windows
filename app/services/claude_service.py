"""Claude service — direct Anthropic API calls with in-process tool execution."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import AsyncIterator

import anthropic
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.claude_auth import get_claude_auth, ClaudeAuth
from app.core.config import get_settings
from app.core.recall_client import get_recall_client
from app.services.mcp_manager import get_mcp_manager
from app.models.project import Project
from app.models.canvas import Canvas, CanvasComponent
from app.models.idea import Idea
from app.models.scaffold import ScaffoldJob
from app.models.deploy import Environment
from app.models.conversation import Conversation, ConversationMessage

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
                "status": {
                    "type": "string",
                    "description": "Filter by status. Optional.",
                },
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
    {
        "name": "create_idea",
        "description": "Create a new Idea from the conversation. Use when the user asks to capture something as an idea or a design proposal emerges.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Short title for the idea"},
                "description": {
                    "type": "string",
                    "description": "Detailed description of the idea",
                },
                "category": {
                    "type": "string",
                    "description": "Optional category (e.g. feature, improvement, research)",
                },
            },
            "required": ["title", "description"],
        },
    },
    {
        "name": "push_to_recall",
        "description": "Store key decisions, entities, or facts from this conversation in the project's knowledge base (Recall). Use when the user asks to 'remember this', 'save to Recall', or 'save to memory', or when important architectural decisions emerge.",
        "input_schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "List of knowledge items to store",
                    "items": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "The knowledge content to store",
                            },
                            "entity_type": {
                                "type": "string",
                                "enum": [
                                    "decision",
                                    "concept",
                                    "technology",
                                    "requirement",
                                    "architecture",
                                ],
                                "description": "Type of knowledge entity",
                            },
                        },
                        "required": ["content", "entity_type"],
                    },
                },
            },
            "required": ["items"],
        },
    },
    {
        "name": "autopilot_status",
        "description": "Get the current Autopilot mode and progress. Returns mode (plan/build/verify), task status, and recent build log entries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_dir": {
                    "type": "string",
                    "description": "Working directory containing .autopilot/. Defaults to current dir.",
                },
            },
        },
    },
    {
        "name": "autopilot_read_spec",
        "description": "Read the Autopilot spec.md file which contains the build specification created during /plan.",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_dir": {"type": "string"},
            },
        },
    },
    {
        "name": "autopilot_read_progress",
        "description": "Read the Autopilot progress.json with all task statuses (DONE/PENDING/IN_PROGRESS/BLOCKED).",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_dir": {"type": "string"},
            },
        },
    },
    {
        "name": "autopilot_read_log",
        "description": "Read the Autopilot build.log file with build output and TDD results.",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_dir": {"type": "string"},
                "tail_lines": {
                    "type": "integer",
                    "description": "Number of lines from end. Default 50.",
                },
            },
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

    canvas_count = (
        await db.execute(
            select(func.count())
            .select_from(Canvas)
            .where(Canvas.project_id == project_id)
        )
    ).scalar() or 0

    idea_count = (
        await db.execute(
            select(func.count()).select_from(Idea).where(Idea.project_id == project_id)
        )
    ).scalar() or 0

    return json.dumps(
        {
            "id": project.id,
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
            "member_count": len(project.members),
            "canvas_count": canvas_count,
            "idea_count": idea_count,
            "created_at": project.created_at.isoformat()
            if project.created_at
            else None,
        }
    )


async def _tool_get_canvas_components(
    project_id: str, canvas_id: str, db: AsyncSession
) -> str:
    result = await db.execute(
        select(CanvasComponent).where(
            CanvasComponent.canvas_id == canvas_id,
        )
    )
    components = result.scalars().all()
    return json.dumps(
        [
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
        ]
    )


async def _tool_list_canvases(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(select(Canvas).where(Canvas.project_id == project_id))
    canvases = result.scalars().all()
    out = []
    for c in canvases:
        comp_count = (
            await db.execute(
                select(func.count())
                .select_from(CanvasComponent)
                .where(CanvasComponent.canvas_id == c.id)
            )
        ).scalar() or 0
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "component_count": comp_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
    return json.dumps(out)


async def _tool_get_ideas(
    project_id: str, db: AsyncSession, status: str | None = None
) -> str:
    q = select(Idea).where(Idea.project_id == project_id)
    if status:
        q = q.where(Idea.status == status)
    q = q.order_by(Idea.created_at.desc())
    result = await db.execute(q)
    ideas = result.scalars().all()
    return json.dumps(
        [
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
        ]
    )


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
    return json.dumps(
        [
            {
                "id": i.id,
                "title": i.title,
                "description": i.description[:200] if i.description else "",
                "status": i.status,
                "category": i.category,
            }
            for i in ideas
        ]
    )


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
    return json.dumps(
        {
            "id": job.id,
            "status": job.status,
            "component_ids": _safe_json(job.component_ids),
            "spec": _safe_json(job.spec_json),
            "generated_files": _safe_json(job.generated_files),
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
    )


async def _tool_get_deploy_config(project_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Environment).where(Environment.project_id == project_id)
    )
    envs = result.scalars().all()
    return json.dumps(
        [
            {
                "id": e.id,
                "name": e.name,
                "config": _safe_json(e.config_json),
                "compose_yaml": e.compose_yaml,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in envs
        ]
    )


async def _tool_get_knowledge_context(project_slug: str, query: str) -> str:
    recall = get_recall_client()
    try:
        context = await recall.get_context(query=query, max_tokens=2000)
        return (
            context
            if context
            else json.dumps({"result": "No knowledge found for this query."})
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


async def _tool_push_to_recall(
    project_id: str,
    project_slug: str,
    items: list[dict],
    db: AsyncSession,
) -> str:
    """Store knowledge items in Recall and create local KnowledgeEntity rows."""
    from app.models.knowledge import KnowledgeEntity
    from app.services.recall_knowledge import store_knowledge

    stored = []
    for item in items:
        content = item.get("content", "")
        entity_type = item.get("entity_type", "concept")
        if not content:
            continue

        # Create local entity
        entity = KnowledgeEntity(
            project_id=project_id,
            name=content[:300],
            entity_type=entity_type,
            description=content,
            source_type="conversation",
        )
        db.add(entity)

        # Push to Recall
        try:
            await store_knowledge(
                project_slug=project_slug,
                name=content[:100],
                entity_type=entity_type,
                description=content,
                metadata={"source": "conversation"},
            )
            stored.append({"content": content[:100], "status": "stored"})
        except Exception as e:
            logger.warning("push_to_recall.failed", error=str(e))
            stored.append(
                {"content": content[:100], "status": "local_only", "error": str(e)}
            )

    await db.flush()
    return json.dumps({"stored": stored, "count": len(stored)})


async def _tool_create_idea(
    project_id: str,
    user_id: str,
    title: str,
    description: str,
    category: str | None,
    db: AsyncSession,
) -> str:
    """Create an idea from the AI chat tool."""
    from app.core.background import enqueue
    from app.services.embedding import get_embedding, embedding_to_json
    from app.services.feasibility import score_idea_feasibility
    from app.core.database import async_session

    idea_id = str(uuid.uuid4())

    # Try inline embedding, graceful fallback
    emb_json = None
    try:
        emb = await get_embedding(f"{title}\n{description}")
        emb_json = embedding_to_json(emb)
    except Exception as e:
        logger.warning("create_idea.embed_failed", error=str(e))

    idea = Idea(
        id=idea_id,
        project_id=project_id,
        title=title,
        description=description,
        category=category,
        embedding=emb_json,
        created_by=user_id,
    )
    db.add(idea)
    await db.flush()

    # Background feasibility scoring
    async def _run_feasibility(iid: str):
        async with async_session() as sess:
            await score_idea_feasibility(iid, sess)

    await enqueue("feasibility", _run_feasibility, idea.id)

    return json.dumps(
        {
            "status": "created",
            "idea_id": idea.id,
            "title": idea.title,
            "description": idea.description[:200],
            "category": idea.category,
        }
    )


def _autopilot_dir(work_dir: str | None = None) -> Path:
    """Resolve the .autopilot directory."""
    base = Path(work_dir) if work_dir else Path.cwd()
    return base / ".autopilot"


def _tool_autopilot_status(work_dir: str | None = None) -> str:
    ap = _autopilot_dir(work_dir)
    if not ap.exists():
        return json.dumps(
            {
                "error": "No .autopilot/ directory found",
                "hint": "Run /plan first to create an Autopilot spec.",
            }
        )

    result: dict = {"autopilot_dir": str(ap)}

    # Read mode
    mode_file = ap / "mode"
    if mode_file.exists():
        result["mode"] = mode_file.read_text(encoding="utf-8").strip()

    # Read progress summary
    progress_file = ap / "progress.json"
    if progress_file.exists():
        try:
            progress = json.loads(progress_file.read_text(encoding="utf-8"))
            tasks = progress.get("tasks", [])
            result["task_summary"] = {
                "total": len(tasks),
                "done": sum(1 for t in tasks if t.get("status") == "DONE"),
                "in_progress": sum(
                    1 for t in tasks if t.get("status") == "IN_PROGRESS"
                ),
                "pending": sum(1 for t in tasks if t.get("status") == "PENDING"),
                "blocked": sum(1 for t in tasks if t.get("status") == "BLOCKED"),
            }
        except (json.JSONDecodeError, OSError):
            result["task_summary"] = {"error": "Could not parse progress.json"}

    # Read last few lines of build log
    log_file = ap / "build.log"
    if log_file.exists():
        try:
            lines = log_file.read_text(encoding="utf-8").splitlines()
            result["recent_log"] = lines[-10:] if len(lines) > 10 else lines
        except OSError:
            pass

    # Check for spec
    result["has_spec"] = (ap / "spec.md").exists()

    return json.dumps(result)


def _tool_autopilot_read_spec(work_dir: str | None = None) -> str:
    spec = _autopilot_dir(work_dir) / "spec.md"
    if not spec.exists():
        return json.dumps({"error": "No spec.md found. Run /plan to create one."})
    try:
        return spec.read_text(encoding="utf-8")
    except OSError as e:
        return json.dumps({"error": str(e)})


def _tool_autopilot_read_progress(work_dir: str | None = None) -> str:
    progress = _autopilot_dir(work_dir) / "progress.json"
    if not progress.exists():
        return json.dumps({"error": "No progress.json found."})
    try:
        return progress.read_text(encoding="utf-8")
    except OSError as e:
        return json.dumps({"error": str(e)})


def _tool_autopilot_read_log(work_dir: str | None = None, tail_lines: int = 50) -> str:
    log = _autopilot_dir(work_dir) / "build.log"
    if not log.exists():
        return json.dumps({"error": "No build.log found."})
    try:
        lines = log.read_text(encoding="utf-8").splitlines()
        tail = lines[-tail_lines:] if len(lines) > tail_lines else lines
        return "\n".join(tail)
    except OSError as e:
        return json.dumps({"error": str(e)})


async def _execute_tool(
    name: str,
    tool_input: dict,
    project_id: str,
    project_slug: str,
    user_id: str,
    db: AsyncSession,
) -> str:
    """Dispatch a tool call to the appropriate Python function."""
    try:
        match name:
            case "get_project_summary":
                return await _tool_get_project_summary(
                    tool_input.get("project_id", project_id), db
                )
            case "get_canvas_components":
                return await _tool_get_canvas_components(
                    tool_input.get("project_id", project_id),
                    tool_input["canvas_id"],
                    db,
                )
            case "list_canvases":
                return await _tool_list_canvases(
                    tool_input.get("project_id", project_id), db
                )
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
                return await _tool_get_deploy_config(
                    tool_input.get("project_id", project_id), db
                )
            case "get_knowledge_context":
                return await _tool_get_knowledge_context(
                    tool_input.get("project_slug", project_slug),
                    tool_input["query"],
                )
            case "create_idea":
                return await _tool_create_idea(
                    project_id,
                    user_id,
                    tool_input["title"],
                    tool_input["description"],
                    tool_input.get("category"),
                    db,
                )
            case "push_to_recall":
                return await _tool_push_to_recall(
                    project_id,
                    project_slug,
                    tool_input.get("items", []),
                    db,
                )
            case "autopilot_status":
                return _tool_autopilot_status(tool_input.get("work_dir"))
            case "autopilot_read_spec":
                return _tool_autopilot_read_spec(tool_input.get("work_dir"))
            case "autopilot_read_progress":
                return _tool_autopilot_read_progress(tool_input.get("work_dir"))
            case "autopilot_read_log":
                return _tool_autopilot_read_log(
                    tool_input.get("work_dir"),
                    tool_input.get("tail_lines", 50),
                )
            case _:
                return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        logger.error("tool.execution_error", tool=name, error=str(e))
        return json.dumps({"error": f"Tool execution failed: {str(e)}"})


# ── System prompt ──────────────────────────────────────────────────────────


async def _build_system_prompt(
    project_name: str,
    project_slug: str,
    project_id: str,
) -> str:
    base = (
        f"You are the AI assistant for Codevv, a collaborative software design tool.\n"
        f"You have tools to query project data and knowledge memory.\n"
        f"Current project: {project_name} (slug: {project_slug}, id: {project_id})\n"
        f"Recall domain for this project: codevv:{project_slug}\n"
        f"When tools require project_id, use: {project_id}\n"
        f"When tools require project_slug, use: {project_slug}\n"
        f"You can create ideas from conversation using the create_idea tool.\n"
        f"You can save decisions and knowledge to the project memory using push_to_recall.\n"
        f"When the user asks about architecture, use both canvas tools and knowledge tools.\n"
        f"Be concise and helpful. Use markdown for formatting."
    )

    # Enrich with Recall context (cached per conversation start, not every message)
    try:
        recall = get_recall_client()
        context = await recall.get_context(
            query=f"project {project_name} architecture decisions",
            max_tokens=1500,
        )
        if context:
            base += f"\n\n## Project Knowledge (from Recall):\n{context}"
    except Exception:
        pass  # Recall down — proceed without context

    return base


# ── Conversation persistence helpers ──────────────────────────────────────


def _extract_text(content: list[dict] | str) -> str:
    """Extract plain text from Anthropic message content blocks."""
    if isinstance(content, str):
        return content
    parts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(block["text"])
    return "\n".join(parts)


def _extract_tool_uses(content: list[dict] | str) -> str | None:
    """Extract tool uses as JSON string from content blocks."""
    if isinstance(content, str):
        return None
    tools = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            tools.append({"name": block["name"], "input": block.get("input", {})})
    return json.dumps(tools) if tools else None


async def _load_conversation_messages(conv: Conversation) -> list[dict]:
    """Rebuild Anthropic-format messages from persisted conversation."""
    messages: list[dict] = []
    for msg in conv.messages:
        if msg.role == "user":
            messages.append({"role": "user", "content": msg.content})
        elif msg.role == "assistant":
            # Rebuild content blocks
            content: list[dict] = [{"type": "text", "text": msg.content}]
            if msg.tool_uses_json:
                try:
                    tool_uses = json.loads(msg.tool_uses_json)
                    for tu in tool_uses:
                        content.append(
                            {
                                "type": "tool_use",
                                "id": f"stored_{uuid.uuid4().hex[:12]}",
                                "name": tu["name"],
                                "input": tu.get("input", {}),
                            }
                        )
                except (json.JSONDecodeError, KeyError):
                    pass
            messages.append({"role": "assistant", "content": content})
    return messages


# ── Main service ───────────────────────────────────────────────────────────


class ClaudeService:
    """Manages conversations and Anthropic API calls with SQLite persistence."""

    def __init__(self):
        # In-memory cache: key -> {conversation_id, messages}
        self._cache: dict[str, dict] = {}

    def _key(self, user_id: str, project_id: str) -> str:
        return f"{user_id}:{project_id}"

    def get_history(self, user_id: str, project_id: str) -> list[dict]:
        entry = self._cache.get(self._key(user_id, project_id))
        return entry["messages"] if entry else []

    def get_conversation_id(self, user_id: str, project_id: str) -> str | None:
        entry = self._cache.get(self._key(user_id, project_id))
        return entry["conversation_id"] if entry else None

    async def clear_history(self, user_id: str, project_id: str) -> None:
        """Start a new conversation (old one stays in DB)."""
        self._cache.pop(self._key(user_id, project_id), None)

    async def load_conversation(
        self,
        conversation_id: str,
        user_id: str,
        project_id: str,
        db: AsyncSession,
    ) -> bool:
        """Load a specific conversation from DB into the cache."""
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
                Conversation.project_id == project_id,
            )
            .options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()
        if not conv:
            return False

        messages = await _load_conversation_messages(conv)
        key = self._key(user_id, project_id)
        self._cache[key] = {
            "conversation_id": conv.id,
            "messages": messages,
        }
        return True

    async def _ensure_conversation(
        self,
        user_id: str,
        project_id: str,
        first_message: str,
        model: str,
        db: AsyncSession,
    ) -> tuple[str, list[dict]]:
        """Get or create a conversation. Returns (conversation_id, messages)."""
        key = self._key(user_id, project_id)
        entry = self._cache.get(key)

        if entry:
            return entry["conversation_id"], entry["messages"]

        # Try loading the most recent conversation from DB
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.user_id == user_id, Conversation.project_id == project_id
            )
            .order_by(Conversation.updated_at.desc())
            .limit(1)
            .options(selectinload(Conversation.messages))
        )
        conv = result.scalar_one_or_none()

        if conv:
            messages = await _load_conversation_messages(conv)
            self._cache[key] = {"conversation_id": conv.id, "messages": messages}
            return conv.id, messages

        # Create a new conversation
        title = first_message[:100].strip() or "New conversation"
        conv = Conversation(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=user_id,
            title=title,
            model=model,
            message_count=0,
        )
        db.add(conv)
        await db.flush()

        messages: list[dict] = []
        self._cache[key] = {"conversation_id": conv.id, "messages": messages}
        return conv.id, messages

    async def _persist_message(
        self,
        conversation_id: str,
        role: str,
        content: list[dict] | str,
        db: AsyncSession,
    ) -> None:
        """Write a message to the DB and update conversation counters."""
        text = _extract_text(content) if isinstance(content, (list,)) else content
        tool_uses = (
            _extract_tool_uses(content) if isinstance(content, (list,)) else None
        )

        msg = ConversationMessage(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=text,
            tool_uses_json=tool_uses,
        )
        db.add(msg)

        # Update conversation metadata
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv:
            conv.message_count = (conv.message_count or 0) + 1
        await db.flush()

    async def start_new_conversation(
        self,
        user_id: str,
        project_id: str,
        db: AsyncSession,
    ) -> str:
        """Explicitly start a new conversation. Returns new conversation_id."""
        key = self._key(user_id, project_id)
        self._cache.pop(key, None)

        conv = Conversation(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=user_id,
            title="New conversation",
            message_count=0,
        )
        db.add(conv)
        await db.flush()

        self._cache[key] = {"conversation_id": conv.id, "messages": []}
        return conv.id

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
        else:
            auth = get_claude_auth()
            access_token = await auth.get_access_token()
            client = anthropic.AsyncAnthropic(
                auth_token=access_token,
                default_headers={
                    "anthropic-beta": ClaudeAuth.get_beta_header(),
                },
            )

        chosen_model = model or settings.claude_model

        # Ensure we have a conversation (creates if needed)
        conversation_id, messages = await self._ensure_conversation(
            user_id,
            project_id,
            message,
            chosen_model,
            db,
        )

        # Build system prompt (async — includes Recall context on first call)
        system_prompt = await _build_system_prompt(
            project_name, project_slug, project_id
        )

        # Build combined tool list: built-in + MCP
        mcp_mgr = get_mcp_manager()
        all_tools = list(TOOLS) + mcp_mgr.get_all_anthropic_tools()

        # Append user message
        messages.append({"role": "user", "content": message})
        await self._persist_message(conversation_id, "user", message, db)

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
                    tools=all_tools,
                ) as stream:
                    # Collect the full response for history
                    collected_content = []

                    async for event in stream:
                        if event.type == "content_block_start":
                            block = event.content_block
                            if block.type == "tool_use":
                                yield {
                                    "type": "tool_use_start",
                                    "name": block.name,
                                    "tool_use_id": block.id,
                                }

                        elif event.type == "content_block_delta":
                            delta = event.delta
                            if delta.type == "text_delta":
                                yield {"type": "text", "text": delta.text}

                    # Get the final message
                    response = await stream.get_final_message()

                # Build content blocks for history
                for block in response.content:
                    if block.type == "text":
                        collected_content.append(
                            {
                                "type": "text",
                                "text": block.text,
                            }
                        )
                    elif block.type == "tool_use":
                        collected_content.append(
                            {
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        )

                # Append assistant message to history and persist
                messages.append({"role": "assistant", "content": collected_content})
                await self._persist_message(
                    conversation_id, "assistant", collected_content, db
                )

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

                            # Route: MCP tools vs built-in tools
                            if mcp_mgr.is_mcp_tool(block.name):
                                result = await mcp_mgr.call_tool(
                                    block.name,
                                    block.input,
                                )
                            else:
                                result = await _execute_tool(
                                    block.name,
                                    block.input,
                                    project_id,
                                    project_slug,
                                    user_id,
                                    db,
                                )

                            tool_results.append(
                                {
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": result,
                                }
                            )

                    # Append tool results to messages
                    messages.append({"role": "user", "content": tool_results})
                    continue

                # Any other stop reason — we're done
                break

            yield {
                "type": "done",
                "model": chosen_model,
                "conversation_id": conversation_id,
            }

        except anthropic.AuthenticationError as e:
            logger.error("claude.auth_error", error=str(e))
            # Remove the user message we just appended since the call failed
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {
                "type": "error",
                "message": "Authentication failed. Token may have expired — try refreshing.",
            }

        except anthropic.RateLimitError as e:
            logger.warning("claude.rate_limit", error=str(e))
            if messages and messages[-1].get("role") == "user":
                messages.pop()
            yield {
                "type": "error",
                "message": "Rate limited. Please wait a moment and try again.",
            }

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
