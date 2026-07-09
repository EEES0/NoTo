import os

from fastapi import FastAPI
from sqlalchemy import inspect, text
from app.api.material import router
from app.database.database import Base, engine
from app.database import models
from fastapi.middleware.cors import CORSMiddleware
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router


def ensure_database_schema():
    inspector = inspect(engine)

    if inspector.has_table("users"):
        user_columns = {
            column["name"]
            for column in inspector.get_columns("users")
        }

        if "is_admin" not in user_columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false"
                    )
                )

        admin_emails = [
            email.strip().lower()
            for email in os.getenv("ADMIN_EMAILS", "").split(",")
            if email.strip()
        ]

        with engine.begin() as connection:
            for email in admin_emails:
                connection.execute(
                    text("UPDATE users SET is_admin = true WHERE lower(email) = :email"),
                    {"email": email}
                )

            admin_count = connection.execute(
                text("SELECT COUNT(*) FROM users WHERE is_admin = true")
            ).scalar_one()

            if admin_count == 0:
                connection.execute(
                    text(
                        "UPDATE users SET is_admin = true "
                        "WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)"
                    )
                )

    if not inspector.has_table("materials"):
        return

    material_columns = {
        column["name"]
        for column in inspector.get_columns("materials")
    }

    if "user_id" not in material_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE materials ADD COLUMN user_id INTEGER")
            )

    if "status" not in material_columns:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE materials "
                    "ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'done'"
                )
            )

    if "error_message" not in material_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE materials ADD COLUMN error_message TEXT")
            )

    transcript_column = next(
        column
        for column in inspector.get_columns("materials")
        if column["name"] == "transcript"
    )

    if not transcript_column["nullable"] and engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE materials ALTER COLUMN transcript DROP NOT NULL")
            )


Base.metadata.create_all(bind=engine)
ensure_database_schema()

DEFAULT_CORS_ORIGINS = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app = FastAPI()
app.include_router(router)
app.include_router(auth_router)
app.include_router(admin_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
