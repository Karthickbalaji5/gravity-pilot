"""
config.py — Centralized configuration for GravityPilot backend.
Reads from environment variables and .env file.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_file_list() -> list[Path]:
    """Return .env search paths: packaged (frozen) or development."""
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).parent
        appdata = Path(os.environ.get("APPDATA", "")) / "Gravity-Pilot"
        return [exe_dir / ".env", appdata / ".env"]
    return [
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
    ]


def _appdata_dir() -> Path:
    """Writable directory for data/output when packaged."""
    d = Path(os.environ.get("APPDATA", "")) / "Gravity-Pilot"
    d.mkdir(parents=True, exist_ok=True)
    return d


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file_list(),
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
        if getattr(sys, "frozen", False):
            p = _appdata_dir() / p
        else:
            p = Path(__file__).parent / p
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def get_output_dir() -> Path:
    """Return the absolute path to the output directory for generated documents."""
    if getattr(sys, "frozen", False):
        out = _appdata_dir() / "output"
    else:
        out = Path(__file__).parent / "output"
    out.mkdir(parents=True, exist_ok=True)
    return out
