#!/usr/bin/env python3
"""Classify unclassified errors using LLM classifier."""
import sys
import os
import sqlite3

sys.path.insert(0, os.path.expanduser("~/projects/routine-demo/src"))

from hooks.collector import get_unclassified_errors
from evaluation.llm_classifier import LLMClassifier

DB_PATH = os.path.expanduser("~/projects/routine-demo/data/skill_eval.db")


def main():
    unclassified = get_unclassified_errors()
    if not unclassified:
        print("No unclassified errors found.")
        return
    print(f"Found {len(unclassified)} unclassified error(s)")
    classifier = LLMClassifier()
    classified = 0
    for row in unclassified:
        fingerprint = row["error_fingerprint"]
        error_message = row.get("error_message") or ""
        if not error_message:
            continue
        error_type = classifier.classify(error_message)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "UPDATE skill_exec_log SET error_type=? WHERE error_fingerprint=?",
            (error_type, fingerprint),
        )
        conn.commit()
        conn.close()
        classified += 1
        print(f"  [{fingerprint[:8]}] {error_message[:60]}... -> {error_type}")
    print(f"Classified {classified} error(s)")


if __name__ == "__main__":
    main()
