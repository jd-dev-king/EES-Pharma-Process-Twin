from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "EES Enterprise Platform API"
    app_version: str = "1.0.0"
    environment: str = "development"
    database_url: str = f"sqlite:///{BASE_DIR / 'ees.db'}"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
