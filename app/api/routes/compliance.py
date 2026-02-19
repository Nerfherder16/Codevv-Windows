"""Launch Compliance — checklists and readiness tracking."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.compliance import ComplianceChecklist, ComplianceCheck
from app.schemas.compliance import (
    ChecklistCreate,
    ChecklistResponse,
    ChecklistDetailResponse,
    CheckCreate,
    CheckUpdate,
    ComplianceCheckResponse,
    LaunchReadinessResponse,
)
from app.api.routes.projects import get_project_with_access
import uuid

router = APIRouter(prefix="/projects/{project_id}/compliance", tags=["compliance"])


async def _checklist_response(cl: ComplianceChecklist, db: AsyncSession) -> dict:
    count = (
        await db.scalar(
            select(func.count()).where(ComplianceCheck.checklist_id == cl.id)
        )
        or 0
    )
    passed = (
        await db.scalar(
            select(func.count()).where(
                ComplianceCheck.checklist_id == cl.id,
                ComplianceCheck.status == "passed",
            )
        )
        or 0
    )
    rate = round((passed / count * 100) if count > 0 else 0, 1)

    return {
        "id": cl.id,
        "project_id": cl.project_id,
        "name": cl.name,
        "description": cl.description,
        "checks_count": count,
        "pass_rate": rate,
        "created_by": cl.created_by,
        "created_at": cl.created_at,
    }


@router.get("", response_model=list[ChecklistResponse])
async def list_checklists(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(ComplianceChecklist)
        .where(ComplianceChecklist.project_id == project_id)
        .order_by(ComplianceChecklist.created_at.desc())
    )
    checklists = result.scalars().all()

    return [await _checklist_response(cl, db) for cl in checklists]


@router.post("", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
async def create_checklist(
    project_id: str,
    body: ChecklistCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    cl = ComplianceChecklist(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=body.name,
        description=body.description,
        created_by=user.id,
    )
    db.add(cl)
    await db.flush()

    return await _checklist_response(cl, db)


@router.get("/readiness", response_model=LaunchReadinessResponse)
async def get_readiness(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    # Get all checklists for this project
    result = await db.execute(
        select(ComplianceChecklist.id).where(
            ComplianceChecklist.project_id == project_id
        )
    )
    checklist_ids = [row[0] for row in result.all()]

    if not checklist_ids:
        return LaunchReadinessResponse(
            overall_score=0,
            category_scores={},
            blockers=[],
            total=0,
            passed=0,
            failed=0,
        )

    # Get all checks across checklists
    result = await db.execute(
        select(ComplianceCheck).where(ComplianceCheck.checklist_id.in_(checklist_ids))
    )
    all_checks = result.scalars().all()

    total = len(all_checks)
    passed = sum(1 for c in all_checks if c.status == "passed")
    failed = sum(1 for c in all_checks if c.status == "failed")
    overall = round((passed / total * 100) if total > 0 else 0, 1)

    # Category scores
    category_counts: dict[str, dict] = {}
    for check in all_checks:
        cat = check.category or "other"
        if cat not in category_counts:
            category_counts[cat] = {"total": 0, "passed": 0}
        category_counts[cat]["total"] += 1
        if check.status == "passed":
            category_counts[cat]["passed"] += 1

    category_scores = {
        cat: round(
            (counts["passed"] / counts["total"] * 100) if counts["total"] > 0 else 0, 1
        )
        for cat, counts in category_counts.items()
    }

    # Blockers = failed checks
    blockers = [
        ComplianceCheckResponse(
            id=c.id,
            checklist_id=c.checklist_id,
            title=c.title,
            description=c.description,
            category=c.category,
            status=c.status,
            evidence_url=c.evidence_url,
            notes=c.notes,
            assigned_to=c.assigned_to,
            updated_by=c.updated_by,
            updated_at=c.updated_at,
            created_at=c.created_at,
        )
        for c in all_checks
        if c.status == "failed"
    ]

    return LaunchReadinessResponse(
        overall_score=overall,
        category_scores=category_scores,
        blockers=blockers,
        total=total,
        passed=passed,
        failed=failed,
    )


@router.get("/{checklist_id}", response_model=ChecklistDetailResponse)
async def get_checklist(
    project_id: str,
    checklist_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(ComplianceChecklist).where(
            ComplianceChecklist.id == checklist_id,
            ComplianceChecklist.project_id == project_id,
        )
    )
    cl = result.scalar_one_or_none()
    if not cl:
        raise HTTPException(status_code=404, detail="Checklist not found")

    checks_result = await db.execute(
        select(ComplianceCheck)
        .where(ComplianceCheck.checklist_id == checklist_id)
        .order_by(ComplianceCheck.created_at)
    )
    checks = checks_result.scalars().all()

    resp = await _checklist_response(cl, db)
    resp["checks"] = [
        {
            "id": c.id,
            "checklist_id": c.checklist_id,
            "title": c.title,
            "description": c.description,
            "category": c.category,
            "status": c.status,
            "evidence_url": c.evidence_url,
            "notes": c.notes,
            "assigned_to": c.assigned_to,
            "updated_by": c.updated_by,
            "updated_at": c.updated_at,
            "created_at": c.created_at,
        }
        for c in checks
    ]
    return resp


@router.post(
    "/{checklist_id}/checks",
    response_model=ComplianceCheckResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_check(
    project_id: str,
    checklist_id: str,
    body: CheckCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    # Verify checklist belongs to project
    result = await db.execute(
        select(ComplianceChecklist).where(
            ComplianceChecklist.id == checklist_id,
            ComplianceChecklist.project_id == project_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Checklist not found")

    check = ComplianceCheck(
        id=str(uuid.uuid4()),
        checklist_id=checklist_id,
        title=body.title,
        description=body.description,
        category=body.category,
        updated_by=user.id,
    )
    db.add(check)
    await db.flush()

    return ComplianceCheckResponse(
        id=check.id,
        checklist_id=check.checklist_id,
        title=check.title,
        description=check.description,
        category=check.category,
        status=check.status,
        evidence_url=check.evidence_url,
        notes=check.notes,
        assigned_to=check.assigned_to,
        updated_by=check.updated_by,
        updated_at=check.updated_at,
        created_at=check.created_at,
    )


@router.patch(
    "/{checklist_id}/checks/{check_id}", response_model=ComplianceCheckResponse
)
async def update_check(
    project_id: str,
    checklist_id: str,
    check_id: str,
    body: CheckUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(ComplianceCheck).where(
            ComplianceCheck.id == check_id,
            ComplianceCheck.checklist_id == checklist_id,
        )
    )
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")

    if body.status is not None:
        check.status = body.status
    if body.evidence_url is not None:
        check.evidence_url = body.evidence_url
    if body.notes is not None:
        check.notes = body.notes
    if body.assigned_to is not None:
        check.assigned_to = body.assigned_to
    check.updated_by = user.id

    await db.flush()

    return ComplianceCheckResponse(
        id=check.id,
        checklist_id=check.checklist_id,
        title=check.title,
        description=check.description,
        category=check.category,
        status=check.status,
        evidence_url=check.evidence_url,
        notes=check.notes,
        assigned_to=check.assigned_to,
        updated_by=check.updated_by,
        updated_at=check.updated_at,
        created_at=check.created_at,
    )
