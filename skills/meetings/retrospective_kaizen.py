#!/usr/bin/env python3
"""
Retrospective/Kaizen Skill
Continuous improvement through team reflection and action items
"""

import json
from datetime import datetime

def create_retro(sprint_num: int, date: str) -> dict:
    """Create a retrospective meeting record."""
    return {
        "sprint_number": sprint_num,
        "date": date,
        "created_at": datetime.now().isoformat(),
        "went_well": [],
        "to_improve": [],
        "action_items": [],
        "team_health": "unknown",
        "morale": 0,
        "status": "scheduled"
    }

def add_went_well(retro: dict, item: str, submitter: str) -> dict:
    """Add something that went well."""
    retro["went_well"].append({
        "item": item,
        "submitter": submitter,
        "votes": 0,
        "timestamp": datetime.now().isoformat()
    })
    return retro

def add_improvement(retro: dict, item: str, submitter: str) -> dict:
    """Add something to improve."""
    retro["to_improve"].append({
        "item": item,
        "submitter": submitter,
        "priority": "medium",
        "timestamp": datetime.now().isoformat()
    })
    return retro

def create_action_from_retro(retro: dict, improvement_item: str, action: str, owner: str, due_date: str) -> dict:
    """Create an action item from a retro improvement."""
    retro["action_items"].append({
        "from": improvement_item,
        "action": action,
        "owner": owner,
        "due_date": due_date,
        "status": "open",
        "sprint_target": None
    })
    return retro

def finalize_retro(retro: dict, morale_score: int) -> dict:
    """Close out the retrospective."""
    retro["morale"] = morale_score
    retro["team_health"] = "good" if morale_score >= 7 else "fair" if morale_score >= 5 else "poor"
    retro["status"] = "complete"
    return retro

if __name__ == "__main__":
    retro = create_retro(42, "2026-10-27")
    retro = add_went_well(retro, "Great collaboration on OAuth", "alice")
    retro = add_improvement(retro, "Need better testing infrastructure", "bob")
    retro = create_action_from_retro(retro, "Need better testing", "Set up E2E test suite", "alice", "2026-11-03")
    retro = finalize_retro(retro, 8)
    print(json.dumps(retro, indent=2))
