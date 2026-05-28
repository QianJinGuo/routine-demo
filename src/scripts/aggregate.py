"""
FailureAggregator
Computes failure_rate per skill over configurable time windows.
"""
import sqlite3, json, os
from datetime import datetime, timezone, timedelta
from typing import Optional

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
FAILURE_RATE_THRESHOLD = 0.05  # 5%

class FailureAggregator:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def get_stats(self, skill_name: str, hours: int = 1) -> dict:
        """Compute failure stats for a skill over the last `hours`."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        cutoff_str = cutoff.isoformat()
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM skill_exec_log WHERE skill_name=? AND ts>=?",
            (skill_name, cutoff_str)
        )
        exec_count = cur.fetchone()[0]
        cur.execute(
            "SELECT COUNT(*) FROM skill_exec_log WHERE skill_name=? AND ts>=? AND exit_code=1",
            (skill_name, cutoff_str)
        )
        error_count = cur.fetchone()[0]
        conn.close()
        failure_rate = error_count / exec_count if exec_count > 0 else 0.0
        return {
            "skill_name": skill_name,
            "time_range": f"last {hours}h",
            "exec_count": exec_count,
            "error_count": error_count,
            "failure_rate": failure_rate,
            "alert_triggered": failure_rate > FAILURE_RATE_THRESHOLD
        }

    def get_all_stats(self, hours: int = 1) -> list:
        """Get stats for all skills in the DB."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT skill_name FROM skill_exec_log")
        skills = [r[0] for r in cur.fetchall()]
        conn.close()
        return [self.get_stats(s, hours) for s in skills]

    def upsert_stats(self, skill_name: str, hours: int = 1) -> None:
        """Save aggregated stats to skill_failure_stats table."""
        stats = self.get_stats(skill_name, hours)
        time_range = f"last_{hours}h"
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO skill_failure_stats "
            "(skill_name, time_range, exec_count, error_count, failure_rate, error_types) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (skill_name, time_range, stats["exec_count"], stats["error_count"],
             stats["failure_rate"], "{}")
        )
        conn.commit()
        conn.close()
