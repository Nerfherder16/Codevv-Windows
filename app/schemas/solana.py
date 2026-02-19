from pydantic import BaseModel
from datetime import datetime


class WatchlistCreate(BaseModel):
    label: str
    address: str
    network: str = "devnet"


class WatchlistResponse(BaseModel):
    id: str
    project_id: str
    label: str
    address: str
    network: str
    balance: float | None = None
    created_by: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BalanceResponse(BaseModel):
    sol: float


class TransactionResponse(BaseModel):
    signature: str
    slot: int
    block_time: int | None = None
    success: bool
    fee: int
