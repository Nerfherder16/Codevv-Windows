<p align="center">
  <img src="codevvlogo.png" alt="Codevv" width="400" />
</p>

<h1 align="center">Codevv-Windows</h1>
<p align="center">Desktop client for the Codevv platform — AI-assisted software design, from idea to deploy.</p>

---

## What Is This?

Codevv-Windows is a lightweight desktop client that connects to a [Codevv](https://github.com/Nerfherder16/Codevv) server. It packages the full Codevv frontend with an embedded FastAPI backend and SQLite database into a single Windows executable.

Think of it as the VS Code to Codevv's GitHub — a rich local experience that syncs with the server.

---

## Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, SQLAlchemy (async), aiosqlite |
| Frontend | React 19, TypeScript, Tailwind v4, Vite |
| Database | SQLite (embedded, zero-config) |
| AI | Claude (OAuth PKCE or API key), SSE streaming, 14 project-aware tools |
| Memory | Recall semantic memory integration |
| Embeddings | Ollama (bge-large 1024d for local search, qwen3:14b for generation) |
| Video | LiveKit real-time video rooms |
| Workspaces | code-server integration |
| MCP | Model Context Protocol server discovery and tool routing |
| Packaging | PyInstaller → single `.exe` binary |

---

## Features

### Projects & Collaboration

- **Multi-project workspace** with role-based access control (owner / editor / viewer)
- **Member management** — invite by email, assign roles per project
- **Project archival** with typed confirmation safety gate

### Canvas (tldraw)

- Visual architecture design board powered by [tldraw](https://tldraw.com)
- Multiple canvases per project with full state persistence
- **Component registry** — shapes on the canvas become structured records (name, type, tech stack, description)
- Components auto-sync to the Knowledge Graph and Recall memory
- Canvas components feed directly into Code Scaffold and Deploy generation

### Idea Vault

- Full idea lifecycle: `draft` → `proposed` → `approved` → `rejected` → `implemented`
- Community voting (upvote/downvote per user)
- Commenting system
- **Semantic search** — Ollama generates vector embeddings, cosine similarity search across all ideas
- **AI feasibility scoring** — background LLM analysis with score + reasoning
- Approved ideas auto-sync to Knowledge Graph + Recall

### Knowledge Graph

- Typed entity nodes with directed relationship edges
- **Graph traversal** — recursive BFS/DFS queries up to configurable depth
- Local semantic search via vector embeddings
- **Recall integration** — search, visualize (D3-compatible), and bulk-migrate between local and Recall
- D3 graph visualization frontend

### Code Scaffold

- **AI-powered code generation** via Ollama (qwen3:14b)
- Human-in-the-loop: generate → review → approve/reject workflow
- **Three built-in Jinja2 templates:**
  - `fastapi_service` — Python service with router, models, DB session
  - `react_component` — TypeScript/React functional component
  - `dockerfile` — Stack-appropriate Dockerfile
- Tech stack auto-detection routes to correct templates
- Linked to canvas components — scaffold what you've designed

### Deploy & Docker Compose

- **Deploy environments** with config and compose YAML management
- **Auto-generated `docker-compose.yaml`** from canvas components — select a canvas, get a compose file
- Deploy job execution with status tracking
- **SSE log streaming** — real-time deploy output in the browser
- Deploy history with status badges per environment

### Video Rooms (LiveKit)

- Create video rooms linked to projects or specific canvases
- Proper LiveKit JWT token generation with video grants
- Desktop fallback mode for local LiveKit instances
- Room lifecycle management (create, list, close)

### Workspaces (code-server)

- Embedded code-server integration for in-app development
- Configurable via environment variable

---

## Claude AI Integration

Two authentication paths — use whichever fits your setup:

| Method | How |
|--------|-----|
| **API Key** | Set `ANTHROPIC_API_KEY` env var |
| **OAuth PKCE** | Uses Claude Code's same OAuth flow — shared credentials at `~/.claude/.credentials.json` |

### Streaming Chat

SSE streaming with `text/event-stream` — real-time token output, tool use events, and error handling. Multi-turn agentic loop with up to 25 tool calls per response.

### 14 Project-Aware Tools

Claude has deep access to your project context:

| Tool | What It Does |
|------|--------------|
| `get_project_summary` | Project name, slug, members, canvas count |
| `list_canvases` | All canvases in the project |
| `get_canvas_components` | Components on a specific canvas |
| `get_ideas` | Ideas filtered by status |
| `search_ideas` | Semantic search across all ideas |
| `create_idea` | Create a new idea from chat |
| `get_scaffold_job` | Check scaffold generation status |
| `get_deploy_config` | Deploy environment + compose YAML |
| `get_knowledge_context` | Knowledge graph nodes relevant to a query |
| `push_to_recall` | Store facts/decisions to Recall memory |
| `autopilot_status` | Read autopilot mode |
| `autopilot_read_spec` | Read the autopilot spec |
| `autopilot_read_progress` | Check autopilot task progress |
| `autopilot_read_log` | Read the autopilot build log |

### Model Selection

Choose per session: **Claude Opus 4.6**, **Claude Sonnet 4.5**, or **Claude Haiku 4.5**.

### Conversation Persistence

Chat history is stored locally in SQLite. View or clear sessions from the AI panel.

---

## MCP Server Integration

Codevv-Windows reads `~/.claude.json` to discover MCP (Model Context Protocol) servers — the same config file Claude Code CLI uses.

- Auto-discovers configured MCP servers
- Connects via stdio subprocess
- Converts MCP tool schemas to Anthropic API format
- Claude automatically routes tool calls: built-in tools → local handlers, MCP tools → connected servers
- Hot-reload config without restarting

Manage connections from the Settings page: connect, disconnect, list tools per server.

---

## Recall Memory

Semantic memory powered by [System-Recall](https://github.com/Nerfherder16/System-Recall) at `http://192.168.50.19:8200`.

- **Domain isolation** — each project gets `codevv:{project_slug}` namespace
- **Automatic storage** — canvas components, approved ideas, and Claude's decisions are pushed to Recall
- **Context enrichment** — Claude's system prompt is seeded with relevant Recall memories at session start
- **Migration** — bulk-migrate local SQLite knowledge to Recall from Settings

---

## Service Health Dashboard

Real-time status checks for all external dependencies, accessible from Settings:

| Service | Check |
|---------|-------|
| Ollama | Model availability (`/api/tags`) |
| Recall | Health endpoint |
| LiveKit | WebSocket connectivity |
| code-server | HTTP reachability |
| Claude | Auth status (API key or OAuth token) |

---

## Settings

| Section | Capabilities |
|---------|-------------|
| Project Details | Edit name, description |
| Members | Add/remove, assign roles |
| Appearance | Dark/light mode toggle |
| AI Assistant | Auth status, model selector, session management |
| External Services | Live status for Ollama, Recall, LiveKit, code-server, Claude |
| MCP Servers | Connect/disconnect, list tools |
| Danger Zone | Archive project with typed confirmation |

---

## Getting Started

### Prerequisites

- Python 3.12+ (3.14 works)
- Node.js 20+
- Ollama running with `bge-large` + `qwen3:14b` models (for embeddings + generation)

### Development

```bash
# Backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run build   # builds into app/static/
```

### Build Executable

```bash
pyinstaller codevv.spec   # produces single .exe
```

---

## Architecture

```
app/
  api/routes/       # FastAPI endpoints (~69 routes)
    auth.py         # Registration, login, JWT, Claude OAuth
    projects.py     # CRUD, members, roles
    canvases.py     # Canvas + component registry
    ideas.py        # Ideas, voting, comments, semantic search
    knowledge.py    # Knowledge graph, Recall integration
    scaffold.py     # AI code generation
    deploy.py       # Environments, compose gen, deploy jobs
    ai.py           # Claude chat, streaming, tool dispatch
    mcp.py          # MCP server management
    video.py        # LiveKit rooms
    workspaces.py   # code-server config
  services/         # Business logic
    claude_service.py   # Claude API client, tool router, streaming
    scaffold.py         # LLM code gen + Jinja2 templates
    compose_gen.py      # Docker Compose YAML generation
    mcp_manager.py      # MCP server lifecycle
  core/             # Config, security, Recall client
  models/           # SQLAlchemy models + Pydantic schemas

frontend/
  src/
    components/
      common/       # Button, Card, Modal, PageHeader, StatCard, DataTable, BentoGrid
      layout/       # Sidebar (grouped nav), TopBar
      auth/         # LoginPage
      features/     # Feature-specific components
    pages/          # One per route: Overview, Canvas, Ideas, Knowledge, Scaffold,
                    #   Deploy, Video, Workspaces, Settings, IdeaDetail
    contexts/       # Auth, Toast, Theme providers
    hooks/          # useDebounce, useLocalStorage, etc.
    lib/
      api.ts        # Typed fetch wrapper
      utils.ts      # cn(), relativeTime, etc.
```

---

## Relationship to Codevv Server

| | Codevv (Docker) | Codevv-Windows |
|---|---|---|
| **Role** | Main server platform | Desktop client |
| **Database** | PostgreSQL + pgvector | SQLite (embedded) |
| **Deployment** | Docker Compose (6 services) | Single `.exe` binary |
| **ADBP Features** | Rules, Dependencies, Pipeline, Solana, Audit, Compliance | Not included (server-only) |
| **Real-time Collab** | Yjs document sync | — |
| **Cache** | Redis | — |
| **Repo** | [Codevv](https://github.com/Nerfherder16/Codevv) | [Codevv-Windows](https://github.com/Nerfherder16/Codevv-Windows) |

---

## License

Private
