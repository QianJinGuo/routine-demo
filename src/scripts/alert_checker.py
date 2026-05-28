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
