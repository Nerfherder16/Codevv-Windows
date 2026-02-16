"""OAuth credential manager for Anthropic API — mirrors Claude Code's PKCE flow."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from pathlib import Path

import httpx
import structlog

logger = structlog.get_logger()

# ── Constants (extracted from Claude Code VS Code extension v2.1.42) ──────
_CREDENTIALS_PATH = Path.home() / ".claude" / ".credentials.json"
_TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
_AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
_SCOPES = ["user:profile", "user:inference", "user:sessions:claude_code", "user:mcp_servers"]
_OAUTH_BETA_HEADER = "oauth-2025-04-20"
_REFRESH_BUFFER_MS = 60_000  # Refresh 60s before expiry


class ClaudeAuth:
    """Manages OAuth tokens for the Anthropic API using the same flow as Claude Code CLI."""

    def __init__(self):
        self._pending_pkce: dict | None = None  # Stores {verifier, state, port} during login

    def has_credentials(self) -> bool:
        """Check if credential file exists with claudeAiOauth."""
        if not _CREDENTIALS_PATH.exists():
            return False
        try:
            data = json.loads(_CREDENTIALS_PATH.read_text(encoding="utf-8"))
            return "claudeAiOauth" in data
        except (json.JSONDecodeError, OSError):
            return False

    def _read_credentials(self) -> dict | None:
        """Read the claudeAiOauth block from credentials file."""
        if not _CREDENTIALS_PATH.exists():
            return None
        try:
            data = json.loads(_CREDENTIALS_PATH.read_text(encoding="utf-8"))
            return data.get("claudeAiOauth")
        except (json.JSONDecodeError, OSError):
            return None

    def _write_credentials(self, oauth: dict) -> None:
        """Write updated OAuth credentials back to file."""
        _CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
        existing = {}
        if _CREDENTIALS_PATH.exists():
            try:
                existing = json.loads(_CREDENTIALS_PATH.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        existing["claudeAiOauth"] = oauth
        _CREDENTIALS_PATH.write_text(
            json.dumps(existing, indent=2), encoding="utf-8"
        )

    async def get_access_token(self) -> str:
        """Return a valid access token, refreshing if expired."""
        creds = self._read_credentials()
        if not creds:
            raise RuntimeError("No Claude credentials found. Please log in first.")

        access_token = creds.get("accessToken", "")
        expires_at = creds.get("expiresAt", 0)
        now_ms = int(time.time() * 1000)

        # If token is still valid (with buffer), return it
        if access_token and expires_at > now_ms + _REFRESH_BUFFER_MS:
            return access_token

        # Token expired or about to expire — refresh
        refresh_token = creds.get("refreshToken", "")
        if not refresh_token:
            raise RuntimeError("No refresh token available. Please log in again.")

        logger.info("claude_auth.refreshing_token")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _TOKEN_URL,
                json={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": _CLIENT_ID,
                    "scope": " ".join(_SCOPES),
                },
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            token_data = resp.json()

        # Update credentials
        new_access = token_data.get("access_token", access_token)
        new_refresh = token_data.get("refresh_token", refresh_token)
        expires_in = token_data.get("expires_in", 3600)
        new_expires_at = int(time.time() * 1000) + (expires_in * 1000)

        creds["accessToken"] = new_access
        creds["refreshToken"] = new_refresh
        creds["expiresAt"] = new_expires_at
        if token_data.get("scope"):
            creds["scopes"] = token_data["scope"].split(" ")
        self._write_credentials(creds)

        logger.info("claude_auth.token_refreshed", expires_in=expires_in)
        return new_access

    def get_status(self) -> dict:
        """Return auth status info."""
        creds = self._read_credentials()
        if not creds:
            return {"authenticated": False}

        now_ms = int(time.time() * 1000)
        expires_at = creds.get("expiresAt", 0)
        return {
            "authenticated": True,
            "subscription": creds.get("subscriptionType", "unknown"),
            "rate_limit_tier": creds.get("rateLimitTier", "unknown"),
            "expires_at": expires_at,
            "expired": expires_at <= now_ms,
            "scopes": creds.get("scopes", []),
        }

    @staticmethod
    def get_beta_header() -> str:
        """Return the anthropic-beta header value needed for OAuth-authenticated requests."""
        return _OAUTH_BETA_HEADER

    def start_login(self, callback_port: int = 8000) -> dict:
        """Start PKCE OAuth flow. Returns auth URL for browser."""
        # Generate PKCE code verifier (32 random bytes, base64url-encoded)
        verifier = secrets.token_bytes(32)
        verifier_b64 = base64.urlsafe_b64encode(verifier).rstrip(b"=").decode("ascii")

        # Generate code challenge (SHA-256 of verifier, base64url-encoded)
        challenge = hashlib.sha256(verifier_b64.encode("ascii")).digest()
        challenge_b64 = base64.urlsafe_b64encode(challenge).rstrip(b"=").decode("ascii")

        # Random state
        state = secrets.token_urlsafe(32)

        redirect_uri = f"http://localhost:{callback_port}/api/auth/claude-callback"
        self._pending_pkce = {
            "verifier": verifier_b64,
            "state": state,
            "redirect_uri": redirect_uri,
        }

        from urllib.parse import urlencode
        params = urlencode({
            "code": "true",
            "client_id": _CLIENT_ID,
            "response_type": "code",
            "scope": " ".join(_SCOPES),
            "code_challenge": challenge_b64,
            "code_challenge_method": "S256",
            "state": state,
            "redirect_uri": redirect_uri,
        })
        auth_url = f"{_AUTHORIZE_URL}?{params}"

        return {"auth_url": auth_url, "state": state}

    async def handle_callback(self, code: str, state: str) -> dict:
        """Exchange authorization code for tokens."""
        if not self._pending_pkce or self._pending_pkce["state"] != state:
            raise ValueError("Invalid or expired state parameter")

        verifier = self._pending_pkce["verifier"]
        redirect_uri = self._pending_pkce["redirect_uri"]
        self._pending_pkce = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _TOKEN_URL,
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": _CLIENT_ID,
                    "code_verifier": verifier,
                    "state": state,
                },
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            token_data = resp.json()

        expires_in = token_data.get("expires_in", 3600)
        oauth = {
            "accessToken": token_data["access_token"],
            "refreshToken": token_data.get("refresh_token", ""),
            "expiresAt": int(time.time() * 1000) + (expires_in * 1000),
            "scopes": token_data.get("scope", " ".join(_SCOPES)).split(" "),
            "subscriptionType": token_data.get("subscription_type"),
            "rateLimitTier": token_data.get("rate_limit_tier"),
        }
        self._write_credentials(oauth)

        logger.info("claude_auth.login_complete", subscription=oauth["subscriptionType"])
        return {"success": True, "subscription": oauth["subscriptionType"]}


_auth: ClaudeAuth | None = None


def get_claude_auth() -> ClaudeAuth:
    global _auth
    if _auth is None:
        _auth = ClaudeAuth()
    return _auth
