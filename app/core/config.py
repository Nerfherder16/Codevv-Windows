import sys
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache


def get_data_dir() -> Path:
    """Data directory next to the exe (or project root in dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent.parent


def _get_or_create_jwt_secret() -> str:
    """Read JWT secret from file, or generate and persist one."""
    secret_file = get_data_dir() / ".jwt_secret"
    if secret_file.exists():
        stored = secret_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored
    secret = secrets.token_hex(32)
    secret_file.write_text(secret, encoding="utf-8")
    return secret


class Settings(BaseSettings):
    # Database — SQLite, file next to exe
    database_url: str = f"sqlite+aiosqlite:///{get_data_dir() / 'codevv.db'}"

    # Auth
    jwt_secret: str = "codevv-local-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200  # 30 days for desktop

    # Ollama
    ollama_url: str = "http://192.168.50.62:11434"
    ollama_model: str = "qwen3:14b"
    ollama_embed_model: str = "bge-large"
    embedding_dims: int = 1024

    # Recall
    recall_url: str = "http://192.168.50.19:8200"

    # Solana
    solana_rpc_url: str = "https://api.devnet.solana.com"

    # LiveKit
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    # code-server
    code_server_url: str = ""

    # Claude
    anthropic_api_key: str = ""  # Set via ANTHROPIC_API_KEY env var or .env
    claude_model: str = "claude-opus-4-6"
    claude_fallback_model: str = "claude-sonnet-4-5-20250929"
    claude_max_turns: int = 25

    # App
    app_name: str = "Codevv"
    host: str = "127.0.0.1"
    port: int = 8000
    open_browser: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def _auto_jwt_secret(self) -> "Settings":
        """Replace the hardcoded default with a persistent random secret."""
        if self.jwt_secret == "codevv-local-secret":
            self.jwt_secret = _get_or_create_jwt_secret()
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
