"""
SkillHookCollector
Intercepts skill_exec_start / skill_exec_end / skill_error events.
Logs to JSON Lines + SQLite. Actual Hermes hook integration TBD.
"""
import json
import sqlite3
import os
from datetime import datetime, timezone
from hashlib import md5
from pathlib import Path

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
LOGS_DIR = os.path.expanduser("~/projects/routine-demo/data/eval_logs")


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _error_fingerprint(error_message: str) -> str:
    return md5(error_message.encode()).hexdigest()


def _append_jsonl(obj: dict) -> None:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = Path(LOGS_DIR) / f"{today}.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(obj) + "\n")


class SkillHookCollector:
    def on_skill_exec_start(self, skill_name: str, task_id: str = "") -> None:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO skill_exec_log (ts, skill_name, exit_code, duration) VALUES (?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), skill_name, None, None)
        )
        conn.commit()
        conn.close()

    def on_skill_exec_end(self, skill_name: str, exit_code: int, duration: float, output_preview: str = "") -> None:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO skill_exec_log (ts, skill_name, exit_code, duration) VALUES (?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), skill_name, exit_code, duration)
        )
        conn.commit()
        conn.close()
        _append_jsonl({
            "ts": datetime.now(timezone.utc).isoformat(),
            "skill": skill_name,
            "exit": exit_code,
            "duration": duration
        })

    def on_skill_error(self, skill_name: str, error_message: str, traceback: str = "", duration: float = 0.0) -> None:
        fingerprint = _error_fingerprint(error_message)
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO skill_exec_log (ts, skill_name, exit_code, duration, error_message, error_fingerprint) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), skill_name, 1, duration, error_message, fingerprint)
        )
        conn.commit()
        conn.close()
        _append_jsonl({
            "ts": datetime.now(timezone.utc).isoformat(),
            "skill": skill_name,
            "exit": 1,
            "duration": duration,
            "error_message": error_message,
            "error_fingerprint": fingerprint
        })


def get_unclassified_errors(skill_name: str = None) -> list:
    conn = _get_conn()
    cur = conn.cursor()
    if skill_name:
        cur.execute(
            "SELECT * FROM skill_exec_log WHERE exit_code=1 AND error_type IS NULL AND skill_name=?",
            (skill_name,)
        )
    else:
        cur.execute("SELECT * FROM skill_exec_log WHERE exit_code=1 AND error_type IS NULL")
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]
