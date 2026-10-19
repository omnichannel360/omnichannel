#!/usr/bin/env python3
"""
Standup Report Skill
Generate daily standup reports and track velocity
"""

import json
from datetime import datetime

def create_standup_report(team: str, date: str) -> dict:
    """Create a daily standup report."""
    return {
        "team": team,
        "date": date,
        "created_at": datetime.now().isoformat(),
        "participants": [],
        "blockers": [],
        "completed": [],
        "in_progress": [],
        "planned": []
    }

def add_standup(report: dict, person: str, completed: list, in_progress: list, blockers: list = None) -> dict:
    """Add one person's standup to report."""
    report["participants"].append({
        "person": person,
        "completed": completed,
        "in_progress": in_progress,
        "blockers": blockers or []
    })

    for blocker in blockers or []:
        report["blockers"].append({"person": person, "blocker": blocker})

    return report

def summarize_report(report: dict) -> dict:
    """Summarize standup report."""
    total_completed = sum(len(p.get("completed", [])) for p in report["participants"])
    total_blockers = len(report["blockers"])

    report["summary"] = {
        "total_participants": len(report["participants"]),
        "total_items_completed": total_completed,
        "total_blockers": total_blockers,
        "health": "green" if total_blockers == 0 else "yellow" if total_blockers < 3 else "red"
    }
    return report

if __name__ == "__main__":
    report = create_standup_report("engineering", "2026-10-20")
    report = add_standup(report, "alice", ["API endpoint"], ["Working on auth"], ["Need DB review"])
    report = add_standup(report, "bob", ["UI tests"], ["Debugging perf issue"], [])
    report = summarize_report(report)
    print(json.dumps(report, indent=2))
