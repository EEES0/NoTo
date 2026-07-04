from datetime import datetime

from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        autoincrement=True
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    saved_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    transcript: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    refined_transcript: Mapped[str] = mapped_column(
        Text,
        nullable=True
    )

    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )
