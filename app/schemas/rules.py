from pydantic import BaseModel


class RulePinRequest(BaseModel):
    memory_id: str


class RuleSearchRequest(BaseModel):
    query: str


class RecallMemoryResponse(BaseModel):
    id: str
    content: str
    domain: str = ""
    tags: list[str] = []
    importance: float = 0.5
    pinned: bool = False
    memory_type: str = "semantic"
    created_at: str = ""
