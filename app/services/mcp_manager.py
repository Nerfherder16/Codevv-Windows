"""MCP Client Manager — connects to MCP servers and exposes their tools."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from pathlib import Path
from typing import Any

import structlog
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

logger = structlog.get_logger()

# Path to Claude's global config
_CLAUDE_CONFIG = Path.home() / ".claude.json"


def _load_mcp_configs() -> dict[str, dict]:
    """Read MCP server configs from ~/.claude.json."""
    if not _CLAUDE_CONFIG.exists():
        return {}
    try:
        data = json.loads(_CLAUDE_CONFIG.read_text(encoding="utf-8"))
        return data.get("mcpServers", {})
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("mcp.config_read_error", error=str(e))
        return {}


class MCPConnection:
    """A connection to a single MCP server."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config
        self.session: ClientSession | None = None
        self.tools: list[dict] = []  # Raw MCP tool definitions
        self.anthropic_tools: list[dict] = []  # Anthropic API format
        self.status: str = "disconnected"
        self.error: str | None = None
        self._exit_stack: contextlib.AsyncExitStack | None = None

    async def connect(self) -> None:
        """Connect to this MCP server subprocess."""
        if self.status == "connected":
            return

        self.status = "connecting"
        self.error = None
        self._exit_stack = contextlib.AsyncExitStack()

        try:
            # Build environment — inherit current env + server-specific vars
            env = dict(os.environ)
            if server_env := self.config.get("env"):
                env.update(server_env)

            params = StdioServerParameters(
                command=self.config["command"],
                args=self.config.get("args", []),
                env=env,
            )

            read, write = await self._exit_stack.enter_async_context(
                stdio_client(params)
            )
            self.session = await self._exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await self.session.initialize()

            # Discover tools
            tools_result = await self.session.list_tools()
            self.tools = []
            self.anthropic_tools = []

            for tool in tools_result.tools:
                raw_schema = (
                    tool.inputSchema
                    if isinstance(tool.inputSchema, dict)
                    else tool.inputSchema.model_dump()
                    if hasattr(tool.inputSchema, "model_dump")
                    else {"type": "object", "properties": {}}
                )
                self.tools.append({
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": raw_schema,
                })
                # Anthropic API format with namespaced name
                self.anthropic_tools.append({
                    "name": f"mcp__{self.name}__{tool.name}",
                    "description": f"[{self.name}] {tool.description or tool.name}",
                    "input_schema": raw_schema,
                })

            self.status = "connected"
            logger.info(
                "mcp.connected",
                server=self.name,
                tool_count=len(self.tools),
            )

        except Exception as e:
            self.status = "failed"
            self.error = str(e)
            logger.error("mcp.connect_failed", server=self.name, error=str(e))
            if self._exit_stack:
                try:
                    await self._exit_stack.aclose()
                except Exception:
                    pass
                self._exit_stack = None

    async def disconnect(self) -> None:
        """Disconnect from this MCP server."""
        if self._exit_stack:
            try:
                await self._exit_stack.aclose()
            except Exception as e:
                logger.warning("mcp.disconnect_error", server=self.name, error=str(e))
            self._exit_stack = None
        self.session = None
        self.tools = []
        self.anthropic_tools = []
        self.status = "disconnected"
        logger.info("mcp.disconnected", server=self.name)

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Execute a tool on this MCP server. Returns string result."""
        if not self.session or self.status != "connected":
            return json.dumps({"error": f"Not connected to MCP server '{self.name}'"})

        try:
            result = await self.session.call_tool(tool_name, arguments)
            # Convert MCP content blocks to a single string
            parts = []
            for content in result.content:
                if hasattr(content, "text"):
                    parts.append(content.text)
                elif hasattr(content, "data"):
                    parts.append(f"[Binary data: {getattr(content, 'mimeType', 'unknown')}]")
                else:
                    parts.append(str(content))

            output = "\n".join(parts)
            if result.isError:
                return json.dumps({"error": output})
            return output

        except Exception as e:
            logger.error("mcp.tool_error", server=self.name, tool=tool_name, error=str(e))
            return json.dumps({"error": f"MCP tool execution failed: {str(e)}"})


class MCPManager:
    """Manages connections to multiple MCP servers."""

    def __init__(self):
        self._configs: dict[str, dict] = {}
        self._connections: dict[str, MCPConnection] = {}
        self._enabled_servers: set[str] = set()

    def load_configs(self) -> dict[str, dict]:
        """Load/refresh MCP server configs from ~/.claude.json."""
        self._configs = _load_mcp_configs()
        return self._configs

    def get_available_servers(self) -> list[dict]:
        """Return info about all available (configured) MCP servers."""
        if not self._configs:
            self.load_configs()

        servers = []
        for name, config in self._configs.items():
            conn = self._connections.get(name)
            servers.append({
                "name": name,
                "command": config.get("command", ""),
                "args": config.get("args", []),
                "status": conn.status if conn else "disconnected",
                "error": conn.error if conn else None,
                "tool_count": len(conn.tools) if conn else 0,
                "tools": [t["name"] for t in conn.tools] if conn and conn.tools else [],
                "enabled": name in self._enabled_servers,
            })
        return servers

    def get_server_tools(self, server_name: str) -> list[dict]:
        """Get tools from a specific connected server."""
        conn = self._connections.get(server_name)
        if not conn or conn.status != "connected":
            return []
        return conn.tools

    async def connect_server(self, name: str) -> dict:
        """Connect to a specific MCP server by name."""
        if not self._configs:
            self.load_configs()

        config = self._configs.get(name)
        if not config:
            return {"name": name, "status": "failed", "error": f"Unknown MCP server: {name}", "tool_count": 0, "tools": []}

        # Disconnect existing connection if any
        if name in self._connections:
            await self._connections[name].disconnect()

        conn = MCPConnection(name, config)
        self._connections[name] = conn
        await conn.connect()

        if conn.status == "connected":
            self._enabled_servers.add(name)

        return {
            "name": name,
            "status": conn.status,
            "error": conn.error,
            "tool_count": len(conn.tools),
            "tools": [t["name"] for t in conn.tools],
        }

    async def disconnect_server(self, name: str) -> None:
        """Disconnect from a specific MCP server."""
        if name in self._connections:
            await self._connections[name].disconnect()
            del self._connections[name]
        self._enabled_servers.discard(name)

    def get_all_anthropic_tools(self) -> list[dict]:
        """Get all connected MCP tools in Anthropic API tool format."""
        tools = []
        for conn in self._connections.values():
            if conn.status == "connected":
                tools.extend(conn.anthropic_tools)
        return tools

    def is_mcp_tool(self, tool_name: str) -> bool:
        """Check if a tool name is an MCP tool (has mcp__ prefix)."""
        return tool_name.startswith("mcp__")

    async def call_tool(self, namespaced_name: str, arguments: dict) -> str:
        """Call a tool by its namespaced name (mcp__{server}__{tool})."""
        # Parse the namespaced name
        parts = namespaced_name.split("__", 2)
        if len(parts) != 3 or parts[0] != "mcp":
            return json.dumps({"error": f"Invalid MCP tool name: {namespaced_name}"})

        server_name = parts[1]
        tool_name = parts[2]

        conn = self._connections.get(server_name)
        if not conn:
            return json.dumps({"error": f"MCP server '{server_name}' is not connected"})

        return await conn.call_tool(tool_name, arguments)

    async def shutdown(self) -> None:
        """Disconnect all servers. Call on app shutdown."""
        for name in list(self._connections.keys()):
            await self.disconnect_server(name)


# Singleton
_manager: MCPManager | None = None


def get_mcp_manager() -> MCPManager:
    global _manager
    if _manager is None:
        _manager = MCPManager()
        _manager.load_configs()
    return _manager
