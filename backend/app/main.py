import os

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.database import Base, engine

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Shared API foundation for Global Supply Nexus, Pharma Process Twin, and EES Training Academy.",
    lifespan=lifespan,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        (
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "https://jd-dev-king.github.io,"
            "https://ees-jdl.com,"
            "https://www.ees-jdl.com,"
            "https://portfolio.jeremiahlupton.com,"
            "https://www.portfolio.jeremiahlupton.com"
        ),
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)
app.include_router(router, prefix="/api")


@app.get("/", tags=["System"])
def root() -> dict[str, str]:
    return {
        "message": "EES Enterprise Platform API",
        "docs": "/docs",
        "health": "/api/health",
    }
