import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ScaffoldJob(Base):
    __tablename__ = "scaffold_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    canvas_id: Mapped[str] = mapped_column(String(36), ForeignKey("canvases.id"), nullable=False)
    component_ids: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array
    spec_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    generated_files: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON {path: content}
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
