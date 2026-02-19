"""Audit Prep — generate audit reports by aggregating project data."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.audit import AuditReport
from app.models.canvas import Canvas, CanvasComponent
from app.models.idea import Idea
from app.models.scaffold import ScaffoldJob
from app.models.knowledge import KnowledgeEntity, KnowledgeRelation
from app.models.deploy import DeployJob
from app.schemas.audit import AuditReportCreate, AuditReportResponse
from app.api.routes.projects import get_project_with_access
import uuid
import json

router = APIRouter(prefix="/projects/{project_id}/audit", tags=["audit"])


async def _generate_sections(
    project_id: str, section_names: list[str], db: AsyncSession
) -> list[dict]:
    sections = []

    if "architecture" in section_names:
        comp_count = (
            await db.scalar(
                select(func.count())
                .select_from(CanvasComponent)
                .join(Canvas, CanvasComponent.canvas_id == Canvas.id)
                .where(Canvas.project_id == project_id)
            )
            or 0
        )
        canvas_count = (
            await db.scalar(select(func.count()).where(Canvas.project_id == project_id))
            or 0
        )
        score = min(100, comp_count * 10 + canvas_count * 20)
        sections.append(
            {
                "name": "architecture",
                "items": [
                    f"{canvas_count} canvases defined",
                    f"{comp_count} components mapped",
                ],
                "score": score,
                "notes": "Architecture coverage based on canvas and component count.",
            }
        )

    if "code_generation" in section_names:
        total = (
            await db.scalar(
                select(func.count()).where(ScaffoldJob.project_id == project_id)
            )
            or 0
        )
        approved = (
            await db.scalar(
                select(func.count()).where(
                    ScaffoldJob.project_id == project_id,
                    ScaffoldJob.status == "approved",
                )
            )
            or 0
        )
        score = int((approved / total * 100) if total > 0 else 0)
        sections.append(
            {
                "name": "code_generation",
                "items": [
                    f"{total} scaffold jobs total",
                    f"{approved} approved",
                ],
                "score": score,
                "notes": f"Approval rate: {score}%"
                if total > 0
                else "No scaffold jobs yet.",
            }
        )

    if "deployment" in section_names:
        total = await db.scalar(select(func.count()).select_from(DeployJob)) or 0
        success = (
            await db.scalar(select(func.count()).where(DeployJob.status == "success"))
            or 0
        )
        score = int((success / total * 100) if total > 0 else 0)
        sections.append(
            {
                "name": "deployment",
                "items": [
                    f"{total} deploy jobs",
                    f"{success} successful",
                ],
                "score": score,
                "notes": f"Success rate: {score}%"
                if total > 0
                else "No deployments yet.",
            }
        )

    if "ideas" in section_names:
        total = (
            await db.scalar(select(func.count()).where(Idea.project_id == project_id))
            or 0
        )
        implemented = (
            await db.scalar(
                select(func.count()).where(
                    Idea.project_id == project_id,
                    Idea.status == "implemented",
                )
            )
            or 0
        )
        score = int((implemented / total * 100) if total > 0 else 0)
        sections.append(
            {
                "name": "ideas",
                "items": [
                    f"{total} ideas total",
                    f"{implemented} implemented",
                ],
                "score": score,
                "notes": f"Implementation rate: {score}%"
                if total > 0
                else "No ideas yet.",
            }
        )

    if "knowledge" in section_names:
        entities = (
            await db.scalar(
                select(func.count()).where(KnowledgeEntity.project_id == project_id)
            )
            or 0
        )
        relations = (
            await db.scalar(
                select(func.count())
                .select_from(KnowledgeRelation)
                .join(
                    KnowledgeEntity, KnowledgeRelation.source_id == KnowledgeEntity.id
                )
                .where(KnowledgeEntity.project_id == project_id)
            )
            or 0
        )
        score = min(100, entities * 5 + relations * 10)
        sections.append(
            {
                "name": "knowledge",
                "items": [
                    f"{entities} entities",
                    f"{relations} relations",
                ],
                "score": score,
                "notes": "Knowledge graph density.",
            }
        )

    return sections


@router.get("", response_model=list[AuditReportResponse])
async def list_reports(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(AuditReport)
        .where(AuditReport.project_id == project_id)
        .order_by(AuditReport.created_at.desc())
    )
    reports = result.scalars().all()

    return [
        AuditReportResponse(
            id=r.id,
            project_id=r.project_id,
            title=r.title,
            status=r.status,
            generated_by=r.generated_by,
            created_at=r.created_at,
        )
        for r in reports
    ]


@router.post(
    "", response_model=AuditReportResponse, status_code=status.HTTP_201_CREATED
)
async def generate_report(
    project_id: str,
    body: AuditReportCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    sections = await _generate_sections(project_id, body.sections, db)

    report = AuditReport(
        id=str(uuid.uuid4()),
        project_id=project_id,
        title=body.title,
        report_json=json.dumps({"sections": sections}),
        status="ready",
        generated_by=user.id,
    )
    db.add(report)
    await db.flush()

    return AuditReportResponse(
        id=report.id,
        project_id=report.project_id,
        title=report.title,
        report_json={"sections": sections},
        status=report.status,
        generated_by=report.generated_by,
        created_at=report.created_at,
    )


@router.get("/{report_id}", response_model=AuditReportResponse)
async def get_report(
    project_id: str,
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db)

    result = await db.execute(
        select(AuditReport).where(
            AuditReport.id == report_id,
            AuditReport.project_id == project_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report_data = json.loads(report.report_json) if report.report_json else None

    return AuditReportResponse(
        id=report.id,
        project_id=report.project_id,
        title=report.title,
        report_json=report_data,
        status=report.status,
        generated_by=report.generated_by,
        created_at=report.created_at,
    )


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    project_id: str,
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_project_with_access(project_id, user, db, min_role="editor")

    result = await db.execute(
        select(AuditReport).where(
            AuditReport.id == report_id,
            AuditReport.project_id == project_id,
        )
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    await db.delete(report)
    await db.flush()
