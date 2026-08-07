import os
import re

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.api.routes import router
from app.core.config import get_settings
from app.core.database import Base, engine

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)

    # Lightweight compatibility migrations for existing local/demo databases.
    # create_all() creates missing tables but does not add columns to existing tables.
    with engine.begin() as connection:
        inspector = inspect(connection)

        production_order_columns = {
            column["name"]
            for column in inspector.get_columns("production_orders")
        }

        if "bulk_material" not in production_order_columns:
            connection.execute(
                text(
                    "ALTER TABLE production_orders "
                    "ADD COLUMN bulk_material VARCHAR(80) "
                    "NOT NULL DEFAULT 'Propylene Glycol'"
                )
            )

        mix_batch_columns = {
            column["name"]
            for column in inspector.get_columns("mix_batches")
        }

        if "bulk_material" not in mix_batch_columns:
            connection.execute(
                text(
                    "ALTER TABLE mix_batches "
                    "ADD COLUMN bulk_material VARCHAR(80) "
                    "NOT NULL DEFAULT 'Propylene Glycol'"
                )
            )

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Shared API foundation for Global Supply Nexus, Pharma Process Twin, and EES Training Academy.",
    lifespan=lifespan,
)

def normalize_origin(origin: str) -> str:
    origin = origin.strip()
    match = re.fullmatch(r"\[(https?://[^\]]+)\]\(https?://[^)]+\)", origin)
    return match.group(1) if match else origin

allowed_origins = [
    normalize_origin(origin)
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
    if normalize_origin(origin)
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
