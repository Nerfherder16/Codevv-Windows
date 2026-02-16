from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db, async_session
from app.core.security import get_current_user
from app.core.background import enqueue
from app.models.user import User
from app.models.idea import Idea, IdeaVote, IdeaComment
from app.schemas.idea import (
    IdeaCreate,
    IdeaUpdate,
    IdeaVoteRequest,
    IdeaCommentCreate,
    IdeaResponse,
    IdeaDetailResponse,
    CommentResponse,
    IdeaSearchRequest,
)
from app.api.routes.projects import get_project_with_access
from app.services.embedding import get_embedding, embedding_to_json, embedding_from_json, cosine_similarity
from app.services.feasibility import score_idea_feasibility
import uuid
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/projects/{project_id}/ideas", tags=["ideas"])


def _idea_response(idea: Idea) -> IdeaResponse:
    """Build an IdeaResponse with computed vote_count and comment_count."""
    vote_count = sum(v.value for v in idea.votes) if idea.votes else 0
    comment_count = len(idea.comments) if idea.comments else 0
    return IdeaResponse(
        id=idea.id,
        project_id=idea.project_id,
        title=idea.title,
        description=idea.description,
        status=idea.status,
        category=idea.category,
        feasibility_score=idea.feasibility_score,
        feasibility_reason=idea.feasibility_reason,
        vote_count=vote_count,
        comment_count=comment_count,
        created_by=idea.created_by,
        created_at=idea.created_at,
        updated_at=idea.updated_at,
    )


async def _run_feasibility(idea_id: str):
    """Background task: score idea feasibility using its own session."""
    async with async_session() as db:
        await score_idea_feasibility(idea_id, db)


async def _embed_idea(idea_id: str, text: str):
    """Background task: generate and store embedding for an idea."""
    try:
        emb = await get_embedding(text)
        async with async_session() as db:
            result = await db.execute(select(Idea).where(Idea.id == idea_id))
            idea = result.scalar_one_or_none()
            if idea:
                idea.embedding = embedding_to_json(emb)
                await db.flush()
                await db.commit()
    except Exception as e:
        logger.warning("idea.embed_failed", idea_id=idea_id, error=str(e))


@router.post("", response_model=IdeaResponse, status_code=status.HTTP_201_CREATED)
async def create_idea(
    project_id: str,
    body: IdeaCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new idea. Embedding and feasibility scoring run in background."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    idea_id = str(uuid.uuid4())

    # Try to compute embedding inline; fall back to background
    emb_json = None
    try:
        emb = await get_embedding(f"{body.title}\n{body.description}")
        emb_json = embedding_to_json(emb)
    except Exception as e:
        logger.warning("idea.embed_inline_failed", error=str(e))

    idea = Idea(
        id=idea_id,
        project_id=project_id,
        title=body.title,
        description=body.description,
        category=body.category,
        embedding=emb_json,
        created_by=user.id,
    )
    db.add(idea)
    await db.flush()

    # Enqueue feasibility scoring in background
    await enqueue("feasibility", _run_feasibility, idea.id)

    # Return with empty votes/comments lists for response building
    idea.votes = []
    idea.comments = []
    return _idea_response(idea)


@router.get("", response_model=list[IdeaResponse])
async def list_ideas(
    project_id: str,
    status_filter: str | None = None,
    category: str | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List ideas with optional filters: status, category, text search (q)."""
    await get_project_with_access(project_id, user, db)

    query = (
        select(Idea)
        .where(Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )

    if status_filter:
        query = query.where(Idea.status == status_filter)
    if category:
        query = query.where(Idea.category == category)
    if q:
        pattern = f"%{q}%"
        query = query.where(
            Idea.title.ilike(pattern) | Idea.description.ilike(pattern)
        )

    result = await db.execute(query.order_by(Idea.created_at.desc()))
    ideas = result.scalars().all()

    return [_idea_response(idea) for idea in ideas]


@router.get("/{idea_id}", response_model=IdeaDetailResponse)
async def get_idea(
    project_id: str,
    idea_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get idea detail with comments."""
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(Idea)
        .where(Idea.id == idea_id, Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    base = _idea_response(idea)
    comments = [
        CommentResponse(
            id=c.id,
            user_id=c.user_id,
            content=c.content,
            created_at=c.created_at,
        )
        for c in (idea.comments or [])
    ]

    return IdeaDetailResponse(
        **base.model_dump(),
        comments=comments,
    )


@router.patch("/{idea_id}", response_model=IdeaResponse)
async def update_idea(
    project_id: str,
    idea_id: str,
    body: IdeaUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update idea fields. Re-embeds if title or description changed."""
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(Idea)
        .where(Idea.id == idea_id, Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    text_changed = False
    if body.title is not None:
        idea.title = body.title
        text_changed = True
    if body.description is not None:
        idea.description = body.description
        text_changed = True
    if body.status is not None:
        idea.status = body.status
    if body.category is not None:
        idea.category = body.category

    await db.flush()

    # Re-embed in background if text changed
    if text_changed:
        await enqueue("re-embed-idea", _embed_idea, idea.id, f"{idea.title}\n{idea.description}")

    return _idea_response(idea)


@router.post("/{idea_id}/vote", response_model=IdeaResponse)
async def vote_idea(
    project_id: str,
    idea_id: str,
    body: IdeaVoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upvote (+1) or downvote (-1) an idea. Upserts existing vote."""
    await get_project_with_access(project_id, user, db)

    if body.value not in (1, -1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vote value must be +1 or -1")

    result = await db.execute(
        select(Idea)
        .where(Idea.id == idea_id, Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    # Upsert vote
    existing_vote = next((v for v in idea.votes if v.user_id == user.id), None)
    if existing_vote:
        existing_vote.value = body.value
    else:
        vote = IdeaVote(
            id=str(uuid.uuid4()),
            idea_id=idea.id,
            user_id=user.id,
            value=body.value,
        )
        db.add(vote)
        idea.votes.append(vote)

    await db.flush()
    return _idea_response(idea)


@router.post("/{idea_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    project_id: str,
    idea_id: str,
    body: IdeaCommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to an idea."""
    await get_project_with_access(project_id, user, db)

    # Verify idea exists
    result = await db.execute(
        select(Idea).where(Idea.id == idea_id, Idea.project_id == project_id)
    )
    idea = result.scalar_one_or_none()
    if not idea:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Idea not found")

    comment = IdeaComment(
        id=str(uuid.uuid4()),
        idea_id=idea.id,
        user_id=user.id,
        content=body.content,
    )
    db.add(comment)
    await db.flush()

    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        content=comment.content,
        created_at=comment.created_at,
    )


@router.post("/search", response_model=list[IdeaResponse])
async def semantic_search(
    project_id: str,
    body: IdeaSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search across ideas using cosine similarity on embeddings."""
    await get_project_with_access(project_id, user, db)

    try:
        query_emb = await get_embedding(body.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Embedding service unavailable: {e}",
        )

    result = await db.execute(
        select(Idea)
        .where(Idea.project_id == project_id)
        .options(selectinload(Idea.votes), selectinload(Idea.comments))
    )
    ideas = result.scalars().all()

    scored = []
    for idea in ideas:
        emb = embedding_from_json(idea.embedding)
        if emb is None:
            continue
        sim = cosine_similarity(query_emb, emb)
        scored.append((sim, idea))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[: body.limit]

    return [_idea_response(idea) for _, idea in top]
