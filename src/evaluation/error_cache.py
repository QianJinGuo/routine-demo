"""In-memory + SQLite cache for error type classifications."""
import sqlite3
import os
from datetime import datetime, timezone
from typing import Optional

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")

ERROR_TYPES = ["TIMEOUT", "EXCEPTION", "PERMISSION", "NETWORK", "AUTH", "UNKNOWN"]


class ErrorCache:
    def __init__(self):
        self._memory = {}  # fingerprint -> error_type (for speed)

    def get(self, fingerprint: str) -> Optional[str]:
        """Check cache for pre-classified error type."""
        if fingerprint in self._memory:
            return self._memory[fingerprint]
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT error_type FROM error_classification_cache WHERE error_fingerprint=?",
            (fingerprint,)
        )
        row = cur.fetchone()
        conn.close()
        if row:
            self._memory[fingerprint] = row[0]
            return row[0]
        return None

    def set(self, fingerprint: str, error_type: str) -> None:
        """Store classification result in cache."""
        self._memory[fingerprint] = error_type
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO error_classification_cache (error_fingerprint, error_type, classified_at) "
            "VALUES (?, ?, ?)",
            (fingerprint, error_type, datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        conn.close()

    def load_all(self) -> None:
        """Pre-load all cached fingerprints into memory."""
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT error_fingerprint, error_type FROM error_classification_cache")
        for row in cur.fetchall():
            self._memory[row[0]] = row[1]
        conn.close()
