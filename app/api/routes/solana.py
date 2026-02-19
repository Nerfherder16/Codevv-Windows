"""Solana Blockchain — watchlist and balance/transaction monitoring via JSON-RPC."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user
from app.models.user import User
from app.models.solana import SolanaWatchlist
from app.schemas.solana import (
    WatchlistCreate,
    WatchlistResponse,
    BalanceResponse,
    TransactionResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/solana", tags=["solana"])

LAMPORTS_PER_SOL = 1_000_000_000


async def _solana_rpc(method: str, params: list, network: str = "devnet") -> dict:
    settings = get_settings()
    rpc_url = settings.solana_rpc_url
    if network == "testnet":
        rpc_url = "https://api.testnet.solana.com"
    elif network == "mainnet-beta":
        rpc_url = "https://api.mainnet-beta.solana.com"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            rpc_url,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(
                status_code=502, detail=data["error"].get("message", "RPC error")
            )
        return data.get("result", {})


@router.get("/watchlist", response_model=list[WatchlistResponse])
async def list_watchlist(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(SolanaWatchlist)
        .where(SolanaWatchlist.project_id == project_id)
        .order_by(SolanaWatchlist.created_at.desc())
    )
    items = result.scalars().all()

    return [
        WatchlistResponse(
            id=item.id,
            project_id=item.project_id,
            label=item.label,
            address=item.address,
            network=item.network,
            created_by=item.created_by,
            created_at=item.created_at,
        )
        for item in items
    ]


@router.post(
    "/watchlist", response_model=WatchlistResponse, status_code=status.HTTP_201_CREATED
)
async def add_to_watchlist(
    project_id: str,
    body: WatchlistCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    item = SolanaWatchlist(
        id=str(uuid.uuid4()),
        project_id=project_id,
        label=body.label,
        address=body.address,
        network=body.network,
        created_by=user.id,
    )
    db.add(item)
    await db.flush()

    return WatchlistResponse(
        id=item.id,
        project_id=item.project_id,
        label=item.label,
        address=item.address,
        network=item.network,
        created_by=item.created_by,
        created_at=item.created_at,
    )


@router.delete("/watchlist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    project_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(SolanaWatchlist).where(
            SolanaWatchlist.id == item_id,
            SolanaWatchlist.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    await db.delete(item)
    await db.flush()


@router.get("/watchlist/{item_id}/balance", response_model=BalanceResponse)
async def get_balance(
    project_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(SolanaWatchlist).where(
            SolanaWatchlist.id == item_id,
            SolanaWatchlist.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    try:
        data = await _solana_rpc("getBalance", [item.address], item.network)
        lamports = data.get("value", 0)
        return BalanceResponse(sol=lamports / LAMPORTS_PER_SOL)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Solana RPC error: {e}")


@router.get(
    "/watchlist/{item_id}/transactions", response_model=list[TransactionResponse]
)
async def get_transactions(
    project_id: str,
    item_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(SolanaWatchlist).where(
            SolanaWatchlist.id == item_id,
            SolanaWatchlist.project_id == project_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    try:
        sigs = await _solana_rpc(
            "getSignaturesForAddress",
            [item.address, {"limit": 20}],
            item.network,
        )

        transactions = []
        for sig_info in sigs if isinstance(sigs, list) else []:
            transactions.append(
                TransactionResponse(
                    signature=sig_info.get("signature", ""),
                    slot=sig_info.get("slot", 0),
                    block_time=sig_info.get("blockTime"),
                    success=sig_info.get("err") is None,
                    fee=sig_info.get("fee", 0) if "fee" in sig_info else 0,
                )
            )
        return transactions
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Solana RPC error: {e}")
