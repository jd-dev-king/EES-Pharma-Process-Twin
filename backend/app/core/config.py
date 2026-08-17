from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "EES Enterprise Platform API"
    app_version: str = "1.0.0"
    environment: str = "development"
    database_url: str = f"sqlite:///{BASE_DIR / 'ees.db'}"
    parking_access_api_url: str = "https://ees-pharma-parking-access-digital-twin-production.up.railway.app"
    data_moon_api_url: str = "https://ees-universal-data-moon-api-production.up.railway.app"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
