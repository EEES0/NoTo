import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text
from app.database.database import engine
from app.api.material import router
from app.database import models
from fastapi.middleware.cors import CORSMiddleware
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.admin import initialize_admin_users


DEFAULT_CORS_ORIGINS = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_admin_users()
    yield


app = FastAPI(lifespan=lifespan)
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