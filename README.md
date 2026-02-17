# Foundry (Windows Desktop)

A standalone desktop app for collaborative software design — architecture canvases, idea boards, code scaffolding, deployment configs, and an AI assistant powered by Claude with MCP server integration.

## Stack

- **Backend:** Python 3.14 / FastAPI / SQLite (aiosqlite) / SQLAlchemy
- **Frontend:** React 19 / TypeScript / Vite / Tailwind CSS v4
- **AI:** Anthropic Claude (OAuth via Claude Code subscription) with streaming SSE
- **Knowledge:** [Recall](https://github.com/Nerfherder16/System-Recall) for semantic/episodic memory
- **MCP:** Connects to any MCP server from `~/.claude.json` — tools exposed to AI chat

## Features

| Feature | Description |
|---------|-------------|
| **Projects** | Create and manage software projects with team members |
| **Canvas** | Visual architecture diagrams with tldraw — define components, tech stacks, connections |
| **Ideas** | Idea board with voting, comments, feasibility scoring, and status tracking |
| **Scaffold** | Generate project boilerplate from canvas components |
| **Deploy** | Manage deployment environments with Docker Compose configs |
| **Knowledge Graph** | Entity-relation knowledge graph backed by Recall |
| **Video Rooms** | LiveKit-based video collaboration rooms |
| **AI Chat** | Claude-powered assistant with project context, tool use, and streaming |
| **MCP Servers** | Connect to any MCP server (GitHub, Recall, filesystem, etc.) from settings |
| **Autopilot** | Read Autopilot state (spec, progress, build log) from `.autopilot/` |

## Quick Start

```bash
# Clone
git clone https://github.com/Nerfherder16/Foundry-Windows.git
cd Foundry-Windows

# Backend
pip install -r requirements.txt

# Frontend
cd frontend && npm install && npm run build && cd ..

# Run
python -m app.main
```

Opens at `http://127.0.0.1:8000`.

## Authentication

Foundry uses Claude Code's OAuth credentials (no separate API key needed):

- Reads tokens from `~/.claude/.credentials.json`
- Works with Claude Max / Pro subscriptions
- Auto-refreshes expired tokens

To use a standalone API key instead, set in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## MCP Server Integration

Foundry reads MCP server configs from `~/.claude.json` (same file Claude Code uses). Connect servers from **Settings > MCP Servers** in the UI.

Connected servers expose their tools to the AI assistant in chat. Tools are namespaced as `mcp__{server}__{tool}` to avoid collisions.

### Supported servers

Any stdio-based MCP server works. Tested with: `memory`, `recall`, `github`, `filesystem`, `context7`, `familyhub`, `n8n`, `playwright`, `claude-flow`.

## Project Structure

```
app/
  api/routes/       # FastAPI route modules
  core/             # Config, database, auth, Recall client
  models/           # SQLAlchemy models
  services/         # Claude service, MCP manager
  schemas/          # Pydantic schemas
  static/           # Built frontend (generated)
frontend/
  src/
    components/     # React components (ai/, common/, layout/, auth/)
    contexts/       # React contexts (AI chat, theme, toast, auth)
    hooks/          # Custom hooks (useSSE)
    pages/          # Page components
    lib/            # API client, utilities
```

## Configuration

All settings via environment variables or `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | *(empty)* | Anthropic API key (optional if using OAuth) |
| `RECALL_URL` | `http://192.168.50.19:8200` | Recall server URL |
| `DATABASE_URL` | `sqlite+aiosqlite:///foundry.db` | SQLite database path |
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `8000` | Server port |

## License

Private — Tim's homelab project.
