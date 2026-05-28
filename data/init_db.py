#!/usr/bin/env python3
"""Initialize SQLite schema for skill evaluation framework."""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "skill_eval.db")


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS skill_exec_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT,
        skill_name TEXT,
        exit_code INTEGER,
        duration REAL,
        error_message TEXT,
        error_fingerprint TEXT,
        error_type TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS error_classification_cache (
        error_fingerprint TEXT PRIMARY KEY,
        error_type TEXT,
        classified_at TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS skill_failure_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT,
        time_range TEXT,
        exec_count INTEGER,
        error_count INTEGER,
        failure_rate REAL,
        error_types TEXT
    );
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT,
        triggered_at TEXT,
        failure_rate REAL,
        alert_content TEXT
    );
    """)
    conn.commit()
    conn.close()
    print("DB initialized at", DB_PATH)


if __name__ == "__main__":
    init_db()
