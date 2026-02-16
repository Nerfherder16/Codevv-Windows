import httpx
import json
from app.core.config import get_settings

settings = get_settings()


async def llm_generate(prompt: str, system: str = "", format_json: bool = True) -> dict | str:
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3},
        "think": False,
    }
    if system:
        payload["system"] = system
    if format_json:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(f"{settings.ollama_url}/api/generate", json=payload)
        resp.raise_for_status()
        data = resp.json()
        response_text = data.get("response", "")

    if format_json:
        return json.loads(response_text)
    return response_text
