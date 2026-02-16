import sys
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


def get_data_dir() -> Path:
    """Data directory next to the exe (or project root in dev)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent.parent.parent


class Settings(BaseSettings):
    # Database — SQLite, file next to exe
    database_url: str = f"sqlite+aiosqlite:///{get_data_dir() / 'foundry.db'}"

    # Auth
    jwt_secret: str = "foundry-local-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 43200  # 30 days for desktop

    # Ollama
    ollama_url: str = "http://192.168.50.62:11434"
    ollama_model: str = "qwen3:14b"
    ollama_embed_model: str = "bge-large"
    embedding_dims: int = 1024

    # Recall
    recall_url: str = "http://192.168.50.19:8200"

    # Claude
    anthropic_api_key: str = ""  # Set via ANTHROPIC_API_KEY env var or .env
    claude_model: str = "claude-opus-4-6"
    claude_fallback_model: str = "claude-sonnet-4-5-20250929"
    claude_max_turns: int = 25

    # App
    app_name: str = "Foundry"
    host: str = "127.0.0.1"
    port: int = 8000
    open_browser: bool = True

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
