from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(
        primary_key=True, 
        autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        nullable=False)
    nickname: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    password: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False
    )



class Material(Base):
    __tablename__ = "materials"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )
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
