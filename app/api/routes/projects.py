from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectMember
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectMemberAdd,
    ProjectResponse,
    ProjectDetailResponse,
    MemberResponse,
)
import uuid
import re

router = APIRouter(prefix="/projects", tags=["projects"])

ROLE_PRIORITY = {"owner": 0, "editor": 1, "viewer": 2}


def slugify(name: str) -> str:
    """Convert a project name to a URL-friendly slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


async def get_project_with_access(
    project_id: str,
    user: User,
    db: AsyncSession,
    min_role: str = "viewer",
) -> Project:
    """Load a project and verify the user has at least `min_role` access."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.members))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    membership = next((m for m in project.members if m.user_id == user.id), None)
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this project")

    required = ROLE_PRIORITY.get(min_role, 2)
    actual = ROLE_PRIORITY.get(membership.role, 2)
    if actual > required:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least '{min_role}' role",
        )

    return project


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project and add the creator as owner."""
    project_id = str(uuid.uuid4())
    slug = slugify(body.name)

    # Ensure slug uniqueness by appending short id if collision
    existing = await db.execute(select(Project).where(Project.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{project_id[:8]}"

    project = Project(
        id=project_id,
        name=body.name,
        slug=slug,
        description=body.description,
        created_by=user.id,
    )
    db.add(project)
    await db.flush()

    member = ProjectMember(
        id=str(uuid.uuid4()),
        project_id=project.id,
        user_id=user.id,
        role="owner",
    )
    db.add(member)
    await db.flush()

    return ProjectResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        archived=project.archived,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=1,
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all non-archived projects the user is a member of."""
    result = await db.execute(
        select(Project)
        .join(ProjectMember)
        .where(ProjectMember.user_id == user.id, Project.archived == False)
        .options(selectinload(Project.members))
    )
    projects = result.scalars().unique().all()

    return [
        ProjectResponse(
            id=p.id,
            name=p.name,
            slug=p.slug,
            description=p.description,
            archived=p.archived,
            created_by=p.created_by,
            created_at=p.created_at,
            updated_at=p.updated_at,
            member_count=len(p.members),
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get project details including member list."""
    project = await get_project_with_access(project_id, user, db)

    # Resolve display_name / email for each member
    member_user_ids = [m.user_id for m in project.members]
    users_result = await db.execute(select(User).where(User.id.in_(member_user_ids)))
    users_map = {u.id: u for u in users_result.scalars().all()}

    members = []
    for m in project.members:
        u = users_map.get(m.user_id)
        members.append(
            MemberResponse(
                id=m.id,
                user_id=m.user_id,
                display_name=u.display_name if u else "Unknown",
                email=u.email if u else "",
                role=m.role,
                joined_at=m.joined_at,
            )
        )

    return ProjectDetailResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        archived=project.archived,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=len(project.members),
        members=members,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update project name, description, or archived status. Requires editor role."""
    project = await get_project_with_access(project_id, user, db, min_role="editor")

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.archived is not None:
        project.archived = body.archived

    await db.flush()

    return ProjectResponse(
        id=project.id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        archived=project.archived,
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
        member_count=len(project.members),
    )


@router.post("/{project_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: str,
    body: ProjectMemberAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to the project by email. Requires owner role."""
    project = await get_project_with_access(project_id, user, db, min_role="owner")

    # Find the user by email
    result = await db.execute(select(User).where(User.email == body.email))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found with that email")

    # Check not already a member
    existing = next((m for m in project.members if m.user_id == target_user.id), None)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")

    member = ProjectMember(
        id=str(uuid.uuid4()),
        project_id=project.id,
        user_id=target_user.id,
        role=body.role,
    )
    db.add(member)
    await db.flush()

    return MemberResponse(
        id=member.id,
        user_id=target_user.id,
        display_name=target_user.display_name,
        email=target_user.email,
        role=member.role,
        joined_at=member.joined_at,
    )
