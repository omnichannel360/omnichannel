#!/usr/bin/env python3
"""
Sprint Planning Skill
Plan sprint goals, stories, and capacity
"""

import json
from datetime import datetime, timedelta

def create_sprint(sprint_num: int, start_date: str, duration_days: int = 14) -> dict:
    """Create a sprint planning document."""
    start = datetime.fromisoformat(start_date)
    end = start + timedelta(days=duration_days)

    return {
        "sprint_number": sprint_num,
        "start_date": start_date,
        "end_date": end.isoformat().split("T")[0],
        "duration_days": duration_days,
        "goals": [],
        "stories": [],
        "capacity": 0,
        "total_points": 0,
        "status": "planning"
    }

def add_story(sprint: dict, story_id: str, title: str, points: int, acceptance_criteria: list) -> dict:
    """Add a story to the sprint."""
    sprint["stories"].append({
        "id": story_id,
        "title": title,
        "points": points,
        "acceptance_criteria": acceptance_criteria,
        "assignee": None,
        "status": "backlog"
    })
    sprint["total_points"] += points
    return sprint

def set_sprint_goal(sprint: dict, goal: str) -> dict:
    """Set the sprint goal."""
    sprint["goals"].append({
        "goal": goal,
        "priority": "high",
        "owner": None
    })
    return sprint

def finalize_sprint(sprint: dict) -> dict:
    """Mark sprint as committed."""
    sprint["status"] = "committed"
    sprint["committed_at"] = datetime.now().isoformat()
    return sprint

if __name__ == "__main__":
    sprint = create_sprint(42, "2026-10-20")
    sprint = set_sprint_goal(sprint, "Complete authentication system")
    sprint = add_story(sprint, "FEAT-100", "Implement OAuth2", 13, ["Users can login", "Tokens persist"])
    sprint = add_story(sprint, "FIX-200", "Fix performance bug", 5, ["Latency reduced by 50%"])
    sprint = finalize_sprint(sprint)
    print(json.dumps(sprint, indent=2))
