"""
database.py — SQLite persistence layer using async SQLAlchemy and aiosqlite.
Stores sessions, messages, task outcomes, and preferences across restarts.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import Column, DateTime, Integer, String, Text, delete, select, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_init_lock = asyncio.Lock()


class Base(DeclarativeBase):
    pass


class SessionRecord(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True)
    title = Column(String, default="New Chat")
    status = Column(String, default="idle")  # idle | analyzing | waiting_for_user | planning | executing | validating | completed | failed | cancelled
    current_task_id = Column(String, nullable=True)
    pending_task_type = Column(String, nullable=True)
    pending_original_prompt = Column(Text, nullable=True)
    pending_clarifying_question = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MessageRecord(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    task_id = Column(String, nullable=True)
    role = Column(String, nullable=False)  # "user" | "assistant" | "agent"
    kind = Column(String, default="normal")  # "normal" | "clarification" | "error"
    agent_name = Column(String, nullable=True)
    agent_color = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class TaskHistoryRecord(Base):
    __tablename__ = "task_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    task_id = Column(String, nullable=True)
    task_type = Column(String, nullable=False)
    status = Column(String, nullable=False)  # "completed" | "failed" | "success"
    output_path = Column(String, nullable=True)
    file_type = Column(String, nullable=True)
    file_path = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)


class PreferenceRecord(Base):
    __tablename__ = "preferences"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)


class UserFactRecord(Base):
    __tablename__ = "user_facts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    fact = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


async def _migrate_sqlite_columns(conn):
    """Safely add any missing columns to existing SQLite tables."""
    def _do_migrate(connection):
        cursor = connection.connection.cursor()
        
        # Check sessions columns
        cursor.execute("PRAGMA table_info(sessions)")
        s_cols = {r[1] for r in cursor.fetchall()}
        if "status" not in s_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN status VARCHAR DEFAULT 'idle'")
        if "current_task_id" not in s_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN current_task_id VARCHAR")
        if "pending_task_type" not in s_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN pending_task_type VARCHAR")
        if "pending_original_prompt" not in s_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN pending_original_prompt TEXT")
        if "pending_clarifying_question" not in s_cols:
            cursor.execute("ALTER TABLE sessions ADD COLUMN pending_clarifying_question TEXT")

        # Check messages columns
        cursor.execute("PRAGMA table_info(messages)")
        m_cols = {r[1] for r in cursor.fetchall()}
        if "task_id" not in m_cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN task_id VARCHAR")
        if "kind" not in m_cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN kind VARCHAR DEFAULT 'normal'")
        if "agent_name" not in m_cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN agent_name VARCHAR")
        if "agent_color" not in m_cols:
            cursor.execute("ALTER TABLE messages ADD COLUMN agent_color VARCHAR")

        # Check task_history columns
        cursor.execute("PRAGMA table_info(task_history)")
        t_cols = {r[1] for r in cursor.fetchall()}
        if "task_id" not in t_cols:
            cursor.execute("ALTER TABLE task_history ADD COLUMN task_id VARCHAR")
        if "file_type" not in t_cols:
            cursor.execute("ALTER TABLE task_history ADD COLUMN file_type VARCHAR")
        if "file_path" not in t_cols:
            cursor.execute("ALTER TABLE task_history ADD COLUMN file_path VARCHAR")

    await conn.run_sync(_do_migrate)


async def _get_engine() -> AsyncEngine:
    global _engine, _session_factory
    async with _init_lock:
        if _engine is not None:
            return _engine

        from config import get_db_path

        db_path = get_db_path()
        url = f"sqlite+aiosqlite:///{db_path}"
        _engine = create_async_engine(url, echo=False, future=True)
        _session_factory = async_sessionmaker(
            _engine, class_=AsyncSession, expire_on_commit=False
        )
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await _migrate_sqlite_columns(conn)
        logger.info("SQLite database ready at %s", db_path)

    return _engine


async def _get_session() -> AsyncSession:
    await _get_engine()
    assert _session_factory is not None
    return _session_factory()


async def ensure_session(session_id: str, title: str | None = None) -> None:
    async with await _get_session() as db:
        existing = await db.get(SessionRecord, session_id)
        if not existing:
            db.add(SessionRecord(id=session_id, title=title or "New Chat", status="idle"))
            await db.commit()
        elif title and existing.title == "New Chat":
            existing.title = title[:50]
            existing.updated_at = datetime.utcnow()
            await db.commit()


async def update_session_task_state(
    session_id: str,
    status: str = "idle",
    task_id: str | None = None,
    task_type: str | None = None,
    original_prompt: str | None = None,
    clarifying_question: str | None = None,
) -> None:
    await ensure_session(session_id)
    async with await _get_session() as db:
        sess = await db.get(SessionRecord, session_id)
        if sess:
            sess.status = status
            sess.updated_at = datetime.utcnow()
            if task_id is not None:
                sess.current_task_id = task_id
            if task_type is not None:
                sess.pending_task_type = task_type
            if original_prompt is not None:
                sess.pending_original_prompt = original_prompt
            if clarifying_question is not None:
                sess.pending_clarifying_question = clarifying_question
            elif status in ("completed", "failed", "cancelled", "idle"):
                # Clear pending clarification once task finishes or resets
                sess.pending_task_type = None
                sess.pending_original_prompt = None
                sess.pending_clarifying_question = None
            await db.commit()


async def get_session_task_state(session_id: str) -> dict[str, Any] | None:
    async with await _get_session() as db:
        sess = await db.get(SessionRecord, session_id)
        if not sess:
            return None
        return {
            "session_id": sess.id,
            "title": sess.title,
            "status": sess.status or "idle",
            "current_task_id": sess.current_task_id,
            "pending_task_type": sess.pending_task_type,
            "pending_original_prompt": sess.pending_original_prompt,
            "pending_clarifying_question": sess.pending_clarifying_question,
            "created_at": sess.created_at.isoformat() if sess.created_at else None,
            "updated_at": sess.updated_at.isoformat() if sess.updated_at else None,
        }


async def reset_session_task_state(session_id: str) -> None:
    """Reset session task state to idle and clear pending clarification."""
    await ensure_session(session_id)
    async with await _get_session() as db:
        sess = await db.get(SessionRecord, session_id)
        if sess:
            sess.status = "idle"
            sess.current_task_id = None
            sess.pending_task_type = None
            sess.pending_original_prompt = None
            sess.pending_clarifying_question = None
            sess.updated_at = datetime.utcnow()
            await db.commit()


async def save_message(
    session_id: str,
    role: str,
    content: str,
    task_id: str | None = None,
    kind: str = "normal",
    agent_name: str | None = None,
    agent_color: str | None = None,
) -> None:
    await ensure_session(session_id)
    async with await _get_session() as db:
        db.add(
            MessageRecord(
                session_id=session_id,
                task_id=task_id,
                role=role,
                kind=kind,
                agent_name=agent_name,
                agent_color=agent_color,
                content=content,
                timestamp=datetime.utcnow(),
            )
        )
        sess = await db.get(SessionRecord, session_id)
        if sess:
            sess.updated_at = datetime.utcnow()
            if sess.title == "New Chat" and role == "user":
                sess.title = content[:40].strip() or "Chat"
        await db.commit()


async def get_recent_messages(
    session_id: str, limit: int = 15
) -> list[dict[str, str]]:
    async with await _get_session() as db:
        result = await db.execute(
            select(MessageRecord)
            .where(MessageRecord.session_id == session_id)
            .order_by(MessageRecord.timestamp.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return [{"role": r.role, "content": r.content} for r in reversed(rows)]


async def get_all_messages(session_id: str) -> list[dict[str, Any]]:
    async with await _get_session() as db:
        result = await db.execute(
            select(MessageRecord)
            .where(MessageRecord.session_id == session_id)
            .order_by(MessageRecord.timestamp)
        )
        rows = result.scalars().all()
        return [
            {
                "id": str(r.id),
                "task_id": r.task_id,
                "role": r.role,
                "kind": r.kind or "normal",
                "agent_name": r.agent_name,
                "agent_color": r.agent_color,
                "content": r.content,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in rows
        ]


async def delete_session(session_id: str) -> None:
    """Delete session conversational and task records without removing generated user files."""
    async with await _get_session() as db:
        await db.execute(delete(MessageRecord).where(MessageRecord.session_id == session_id))
        await db.execute(delete(TaskHistoryRecord).where(TaskHistoryRecord.session_id == session_id))
        await db.execute(delete(PreferenceRecord).where(PreferenceRecord.session_id == session_id))
        await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
        await db.commit()


async def save_task_history(
    session_id: str,
    task_type: str,
    status: str,
    output_path: str | None = None,
    task_id: str | None = None,
    file_type: str | None = None,
) -> None:
    await ensure_session(session_id)
    async with await _get_session() as db:
        db.add(
            TaskHistoryRecord(
                session_id=session_id,
                task_id=task_id,
                task_type=task_type,
                status=status,
                output_path=output_path,
                file_path=output_path,
                file_type=file_type,
                timestamp=datetime.utcnow(),
            )
        )
        await db.commit()


async def get_task_history(session_id: str) -> list[dict[str, Any]]:
    async with await _get_session() as db:
        result = await db.execute(
            select(TaskHistoryRecord)
            .where(TaskHistoryRecord.session_id == session_id)
            .order_by(TaskHistoryRecord.timestamp)
        )
        rows = result.scalars().all()
        return [
            {
                "task_id": r.task_id,
                "task_type": r.task_type,
                "status": r.status,
                "output_path": r.output_path or r.file_path,
                "file_type": r.file_type,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in rows
        ]


async def get_session_outputs(session_id: str) -> list[dict[str, Any]]:
    """Return list of valid outputs produced during the session."""
    async with await _get_session() as db:
        result = await db.execute(
            select(TaskHistoryRecord)
            .where(
                TaskHistoryRecord.session_id == session_id,
                TaskHistoryRecord.output_path.isnot(None),
            )
            .order_by(TaskHistoryRecord.timestamp)
        )
        rows = result.scalars().all()
        outputs = []
        for r in rows:
            path = r.output_path or r.file_path
            if path:
                from pathlib import Path
                p = Path(path)
                outputs.append({
                    "task_id": r.task_id,
                    "session_id": session_id,
                    "file_path": str(p),
                    "file_name": p.name,
                    "file_type": r.file_type or p.suffix.lstrip("."),
                    "status": r.status,
                    "created_at": r.timestamp.isoformat() if r.timestamp else None,
                })
        return outputs


async def set_preference(session_id: str, key: str, value: str) -> None:
    await ensure_session(session_id)
    async with await _get_session() as db:
        result = await db.execute(
            select(PreferenceRecord).where(
                PreferenceRecord.session_id == session_id,
                PreferenceRecord.key == key,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db.add(PreferenceRecord(session_id=session_id, key=key, value=value))
        await db.commit()


async def get_preference(session_id: str, key: str) -> str | None:
    async with await _get_session() as db:
        result = await db.execute(
            select(PreferenceRecord).where(
                PreferenceRecord.session_id == session_id,
                PreferenceRecord.key == key,
            )
        )
        row = result.scalar_one_or_none()
        return row.value if row else None


async def get_all_sessions() -> list[dict[str, Any]]:
    async with await _get_session() as db:
        result = await db.execute(
            select(SessionRecord).order_by(SessionRecord.updated_at.desc())
        )
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "title": r.title or "New Chat",
                "status": r.status or "idle",
                "current_task_id": r.current_task_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]


# ── User Facts (long-term memory) ───────────────────────────────────────────

async def get_all_facts() -> list[dict[str, Any]]:
    async with await _get_session() as db:
        result = await db.execute(
            select(UserFactRecord).order_by(UserFactRecord.created_at)
        )
        rows = result.scalars().all()
        return [{"id": r.id, "fact": r.fact, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


async def add_fact(fact: str) -> dict[str, Any]:
    async with await _get_session() as db:
        existing = await db.execute(
            select(UserFactRecord).where(UserFactRecord.fact == fact)
        )
        if existing.scalars().first():
            return {"success": False, "message": "Fact already exists."}
        record = UserFactRecord(fact=fact, created_at=datetime.utcnow())
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return {"success": True, "id": record.id, "fact": record.fact}


async def remove_fact(fact_text: str) -> dict[str, Any]:
    async with await _get_session() as db:
        result = await db.execute(
            select(UserFactRecord).where(UserFactRecord.fact.ilike(f"%{fact_text}%"))
        )
        matches = result.scalars().all()
        if not matches:
            return {"success": False, "message": f"No fact matching '{fact_text}' found."}
        for m in matches:
            await db.delete(m)
        await db.commit()
        return {"success": True, "removed": len(matches)}
