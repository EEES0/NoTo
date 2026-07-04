import os

from fastapi import FastAPI
from app.api.material import router
from app.database.database import Base, engine
from app.database import models
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app = FastAPI()
app.include_router(router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)