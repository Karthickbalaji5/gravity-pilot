"""
config.py — Centralized configuration for GravityPilot backend.
Reads from environment variables and .env file.
"""
from __future__ import annotations

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[
            Path(__file__).parent / ".env",
            Path(__file__).parent.parent / ".env",
        ],
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Groq ──────────────────────────────────────────────────────────────────
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # ── Groq Vision ──────────────────────────────────────────────────────────
    groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    # ── Ollama ────────────────────────────────────────────────────────────────
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3:latest"
    ollama_vision_model: str = "qwen2.5vl"

    # ── Server ────────────────────────────────────────────────────────────────
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # ── Agent Mode ────────────────────────────────────────────────────────────
    use_legacy_graph: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    db_path: str = "./data/desktoppilot.db"

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = "INFO"

    # ── Ping Timeouts (seconds) ───────────────────────────────────────────────
    groq_ping_timeout: float = 6.0
    ollama_ping_timeout: float = 3.0


config = Settings()


def get_db_path() -> Path:
    """Return the absolute path to the SQLite database, creating parent dirs."""
    p = Path(config.db_path)
    if not p.is_absolute():
        p = Path(__file__).parent / p
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_output_dir() -> Path:
    """Return the absolute path to the output directory for generated documents."""
    out = Path(__file__).parent / "output"
    out.mkdir(parents=True, exist_ok=True)
    return out
