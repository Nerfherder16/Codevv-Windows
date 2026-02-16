from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.idea import Idea
from app.services.llm import llm_generate


async def score_idea_feasibility(idea_id: str, db: AsyncSession):
    result = await db.execute(select(Idea).where(Idea.id == idea_id))
    idea = result.scalar_one_or_none()
    if not idea:
        return

    prompt = f"""Evaluate the technical feasibility of this software idea:

Title: {idea.title}
Description: {idea.description}
Category: {idea.category or "General"}

Return JSON with:
{{
  "score": <0.0 to 1.0 feasibility score>,
  "reason": "<2-3 sentence explanation of the score>"
}}

Consider: technical complexity, available tooling, time investment, and common pitfalls."""

    try:
        result = await llm_generate(prompt, system="You are a senior software architect evaluating project feasibility.")
        idea.feasibility_score = float(result.get("score", 0.5))
        idea.feasibility_reason = result.get("reason", "No reason provided")
    except Exception as e:
        idea.feasibility_score = None
        idea.feasibility_reason = f"Scoring failed: {e}"

    await db.flush()
    await db.commit()
