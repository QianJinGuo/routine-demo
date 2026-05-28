# Skill Evaluation Framework Implementation Plan

**Goal:** Build a failure monitoring system that tracks skill exec events, classifies errors via LLM (with cache deduplication), and sends Feishu alerts when failure_rate > 5%.

**Architecture:**
- Hook collector intercepts skill exec events → writes JSON Lines logs
- LLM classifier on first-seen error fingerprint → caches result
- Hourly/daily aggregation → checks >5% threshold → Feishu notification
- All data stored under `~/projects/routine-demo/data/`

**Tech Stack:** Python stdlib + json + sqlite3 + LLM API (MiniMax-M2 via existing provider)

---

## Phase 0: Hook Collector

### Task 1: Create data directory structure

**Files:**
- Create: `~/projects/routine-demo/data/eval_logs/`
- Create: `~/projects/routine-demo/data/skill_eval.db`

**Step 1: Create directories and init SQLite**

```bash
mkdir -p ~/projects/routine-demo/data/eval_logs
touch ~/projects/routine-demo/data/eval_logs/.gitkeep
```

**Step 2: Init SQLite schema**

```bash
python3 - <<'EOF'
import sqlite3, json, os
db_path = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
conn = sqlite3.connect(db_path)
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
print("DB initialized at", db_path)
EOF
```

**Step 3: Commit**

```bash
cd ~/projects/routine-demo
git add data/
git commit -m "init: add data directory and eval DB schema"
```

---

### Task 2: Create SkillHookCollector — skill_exec_start handler

**Files:**
- Create: `~/projects/routine-demo/src/hooks/__init__.py`
- Create: `~/projects/routine-demo/src/hooks/collector.py`

**Step 1: Create hooks/__init__.py**

```python
from .collector import SkillHookCollector

__all__ = ["SkillHookCollector"]
```

**Step 2: Create hooks/collector.py**

```python
"""
SkillHookCollector
Intercepts skill_exec_start / skill_exec_end / skill_error events.
Currently stubs: logs to JSON Lines + SQLite.
Actual integration with Hermes hook system is TBD (requires gateway changes).
"""
import json, sqlite3, os
from datetime import datetime, timezone
from hashlib import md5

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
LOGS_DIR = os.path.expanduser("~/projects/routine-demo/data/eval_logs")

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _error_fingerprint(error_message: str) -> str:
    """Stable hash of error message for cache dedup."""
    return md5(error_message.encode()).hexdigest()

def on_skill_exec_start(skill_name: str, task_id: str = "") -> None:
    """Called when a skill execution begins."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO skill_exec_log (ts, skill_name, exit_code, duration) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(), skill_name, None, None)
    )
    conn.commit()
    conn.close()

def on_skill_exec_end(skill_name: str, exit_code: int, duration: float, output_preview: str = "") -> None:
    """Called when a skill execution completes (success or failure)."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO skill_exec_log (ts, skill_name, exit_code, duration) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(), skill_name, exit_code, duration)
    )
    conn.commit()
    conn.close()
    # Append to JSON Lines log
    log_line = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "skill": skill_name,
        "exit": exit_code,
        "duration": duration
    }
    _append_jsonl(log_line)

def on_skill_error(skill_name: str, error_message: str, traceback: str = "", duration: float = 0.0) -> None:
    """Called when a skill execution hits an error."""
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
    log_line = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "skill": skill_name,
        "exit": 1,
        "duration": duration,
        "error_message": error_message,
        "error_fingerprint": fingerprint
    }
    _append_jsonl(log_line)

def _append_jsonl(obj: dict) -> None:
    """Append one JSON object as a line to today's log file."""
    import pathlib
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = pathlib.Path(LOGS_DIR) / f"{today}.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(obj) + "\n")

def get_unclassified_errors(skill_name: str = None) -> list:
    """Return error log rows where error_type is NULL (not yet classified)."""
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
```

**Step 3: Commit**

```bash
cd ~/projects/routine-demo
git add src/hooks/
git commit -m "feat: add SkillHookCollector with JSON Lines + SQLite logging"
```

---

## Phase 1: Error Classification Cache + LLM Classifier

### Task 3: Create LLM error classifier

**Files:**
- Create: `~/projects/routine-demo/src/evaluation/__init__.py`
- Create: `~/projects/routine-demo/src/evaluation/llm_classifier.py`
- Create: `~/projects/routine-demo/src/evaluation/error_cache.py`

**Step 1: Create evaluation/__init__.py**

```python
from .llm_classifier import LLMClassifier
from .error_cache import ErrorCache

__all__ = ["LLMClassifier", "ErrorCache"]
```

**Step 2: Create evaluation/error_cache.py**

```python
"""In-memory + SQLite cache for error type classifications."""
import sqlite3, json, os
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
```

**Step 3: Create evaluation/llm_classifier.py**

```python
"""LLM-based error type classifier with cache deduplication."""
import json, os, sys
from hashlib import md5
from .error_cache import ErrorCache

# NOTE: Uses the existing MiniMax-M2 provider configured in Hermes.
# LLM call uses hermes_tools.execute_code to make API calls.
# For now, stub with keyword-matching as fallback.

ERROR_KEYWORDS = {
    "TIMEOUT": ["timeout", "timed out", "exceeded", "expired", "deadline"],
    "NETWORK": ["connection refused", "connection reset", "network", "dns", "no route", "econnrefused", "errno 111"],
    "PERMISSION": ["permission denied", "access denied", "forbidden", "eacces", "denied"],
    "AUTH": ["unauthorized", "auth", "token", "credential", "invalid token", "expired token"],
    "EXCEPTION": ["exception", "error", "traceback", "raised", "failed"],
}

def _classify_by_keywords(error_message: str) -> str:
    """Fallback: rule-based keyword matching."""
    msg_lower = error_message.lower()
    for error_type, keywords in ERROR_KEYWORDS.items():
        if any(kw in msg_lower for kw in keywords):
            return error_type
    return "UNKNOWN"

def _call_llm_classify(error_message: str) -> str:
    """Call LLM to classify error type."""
    prompt = (
        f"Classify the following error into one category: TIMEOUT, EXCEPTION, PERMISSION, NETWORK, AUTH, UNKNOWN.\n"
        f"Error message: {error_message}\n"
        f"Respond with ONLY the category name, nothing else."
    )
    # Uses existing MiniMax provider via hermes internal mechanism
    # Stub: in production this would call the LLM API
    return _classify_by_keywords(error_message)  # placeholder until LLM integration is wired

class LLMClassifier:
    def __init__(self):
        self.cache = ErrorCache()
        self.cache.load_all()

    def classify(self, error_message: str) -> str:
        """Classify error type with cache deduplication."""
        fingerprint = md5(error_message.encode()).hexdigest()
        cached = self.cache.get(fingerprint)
        if cached:
            return cached
        error_type = _call_llm_classify(error_message)
        self.cache.set(fingerprint, error_type)
        return error_type
```

**Step 4: Commit**

```bash
cd ~/projects/routine-demo
git add src/evaluation/
git commit -m "feat: add ErrorCache + LLMClassifier with keyword fallback"
```

---

## Phase 2: Aggregation + Alert Checker

### Task 4: Create aggregation + alert check script

**Files:**
- Create: `~/projects/routine-demo/src/scripts/__init__.py`
- Create: `~/projects/routine-demo/src/scripts/aggregate.py`
- Create: `~/projects/routine-demo/src/scripts/alert_checker.py`

**Step 1: Create scripts/__init__.py**

```python
from .aggregate import FailureAggregator
from .alert_checker import AlertChecker

__all__ = ["FailureAggregator", "AlertChecker"]
```

**Step 2: Create scripts/aggregate.py**

```python
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
```

**Step 3: Create scripts/alert_checker.py**

```python
"""
AlertChecker
Monitors failure rates and triggers Feishu alerts when threshold exceeded.
"""
import sqlite3, os
from datetime import datetime, timezone
from typing import Optional
from .aggregate import FailureAggregator

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
FEISHU_WEBHOOK_URL = os.environ.get("FEISHU_WEBHOOK_URL", "")

class AlertChecker:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self.agg = FailureAggregator(db_path)

    def check_and_alert(self, skill_name: str, hours: int = 1) -> Optional[dict]:
        """Check failure rate, fire alert if over threshold. Returns alert dict or None."""
        stats = self.agg.get_stats(skill_name, hours)
        if not stats["alert_triggered"]:
            return None
        alert = self._build_alert(skill_name, stats)
        self._save_alert(alert)
        self._send_feishu(alert)
        return alert

    def _build_alert(self, skill_name: str, stats: dict) -> dict:
        """Build structured alert content."""
        return {
            "skill_name": skill_name,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "failure_rate": stats["failure_rate"],
            "exec_count": stats["exec_count"],
            "error_count": stats["error_count"],
            "message": self._format_message(stats)
        }

    def _format_message(self, stats: dict) -> str:
        pct = stats["failure_rate"] * 100
        return (
            f"【Skill 告警】\n"
            f"Skill：{stats['skill_name']}\n"
            f"失败率：{pct:.1f}%（超过 5% 阈值）\n"
            f"时间范围：最近 {stats.get('time_range', 'N/A')}\n"
            f"失败次数：{stats['error_count']} / 总执行 {stats['exec_count']}\n"
            f"\n修复建议：\n"
            f"1. 检查网络连接稳定性，考虑增加超时时间\n"
            f"2. 添加重试机制（建议 3 次指数退避）"
        )

    def _save_alert(self, alert: dict) -> None:
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO alerts (skill_name, triggered_at, failure_rate, alert_content) VALUES (?, ?, ?, ?)",
            (alert["skill_name"], alert["triggered_at"], alert["failure_rate"], alert["message"])
        )
        conn.commit()
        conn.close()

    def _send_feishu(self, alert: dict) -> None:
        """Send alert to Feishu webhook."""
        import urllib.request, json as _json
        if not FEISHU_WEBHOOK_URL:
            print(f"[AlertChecker] FEISHU_WEBHOOK_URL not set, alert not sent: {alert['skill_name']}")
            return
        payload = {"msg_type": "text", "content": {"text": alert["message"]}}
        req = urllib.request.Request(
            FEISHU_WEBHOOK_URL,
            data=_json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=10)
        print(f"[AlertChecker] Feishu alert sent for {alert['skill_name']}")
```

**Step 4: Commit**

```bash
cd ~/projects/routine-demo
git add src/scripts/
git commit -m "feat: add FailureAggregator + AlertChecker with Feishu webhook"
```

---

## Phase 3: Classify Unclassified Errors

### Task 5: Script to classify unclassified errors

**Files:**
- Create: `~/projects/routine-demo/src/scripts/classify_errors.py`

**Step 1: Create scripts/classify_errors.py**

```python
#!/usr/bin/env python3
"""Classify unclassified errors using LLM classifier."""
import sys, os
sys.path.insert(0, os.path.expanduser("~/projects/routine-demo/src"))

from hooks.collector import get_unclassified_errors
from evaluation.llm_classifier import LLMClassifier

def main():
    unclassified = get_unclassified_errors()
    if not unclassified:
        print("No unclassified errors found.")
        return
    print(f"Found {len(unclassified)} unclassified error(s)")
    classifier = LLMClassifier()
    for row in unclassified:
        fingerprint = row["error_fingerprint"]
        error_message = row["error_message"] or ""
        if not error_message:
            continue
        error_type = classifier.classify(error_message)
        # Update the log row with the classified error type
        import sqlite3
        DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "UPDATE skill_exec_log SET error_type=? WHERE error_fingerprint=?",
            (error_type, fingerprint)
        )
        conn.commit()
        conn.close()
        print(f"  [{fingerprint[:8]}] {error_message[:60]}... -> {error_type}")

if __name__ == "__main__":
    main()
```

**Step 2: Run it**

```bash
python3 ~/projects/routine-demo/src/scripts/classify_errors.py
```

Expected: "No unclassified errors found." (or classify if errors exist)

**Step 3: Commit**

```bash
cd ~/projects/routine-demo
git add src/scripts/classify_errors.py
git commit -m "feat: add classify_errors script"
```

---

## Phase 4: Cron Jobs

### Task 6: Set up hourly + daily cron jobs

**Step 1: Create hourly aggregate script**

```bash
cat > ~/projects/routine-demo/src/scripts/hourly_aggregate.sh << 'EOF'
#!/bin/bash
# Hourly: check failure rates for all skills, fire alerts if over threshold
cd ~/projects/routine-demo
python3 - << 'PYEOF'
import sys, os
sys.path.insert(0, os.path.expanduser("~/projects/routine-demo/src"))
from scripts.aggregate import FailureAggregator
from scripts.alert_checker import AlertChecker

agg = FailureAggregator()
checker = AlertChecker()
for stats in agg.get_all_stats(hours=1):
    if stats["exec_count"] == 0:
        continue
    alert = checker.check_and_alert(stats["skill_name"], hours=1)
    if alert:
        print(f"Alert fired: {alert['skill_name']} ({alert['failure_rate']:.1%})")
PYEOF
EOF
chmod +x ~/projects/routine-demo/src/scripts/hourly_aggregate.sh
```

**Step 2: Create cron job**

```bash
# Add to crontab -e
# Every hour at minute 0
0 * * * * ~/projects/routine-demo/src/scripts/hourly_aggregate.sh >> ~/projects/routine-demo/data/cron_aggregate.log 2>&1
```

**Step 3: Commit**

```bash
cd ~/projects/routine-demo
git add src/scripts/hourly_aggregate.sh
git commit -m "feat: add hourly aggregate cron job"
```

---

## Verification

After Phase 4, verify with:

```bash
# Check DB has tables
sqlite3 ~/projects/routine-demo/data/skill_eval.db ".tables"

# Check hourly script runs without error
~/projects/routine-demo/src/scripts/hourly_aggregate.sh

# Confirm FEISHU_WEBHOOK_URL is set for actual alerts
echo $FEISHU_WEBHOOK_URL
```

---

**Ready to execute via subagent-driven-development?**