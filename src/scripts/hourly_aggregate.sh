#!/bin/bash
# Hourly: aggregate failure stats and fire alerts if over threshold
cd ~/projects/routine-demo
python3 - << 'PYEOF'
import sys
import os

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
