#!/usr/bin/env python3
"""
Postmortem Skill
Root cause analysis and incident prevention
"""

import json
from datetime import datetime

def create_postmortem(incident_id: str, incident_name: str, detected_at: str) -> dict:
    """Create an incident postmortem record."""
    return {
        "incident_id": incident_id,
        "incident_name": incident_name,
        "detected_at": detected_at,
        "created_at": datetime.now().isoformat(),
        "timeline": [],
        "root_causes": [],
        "impact": {},
        "action_items": [],
        "lessons_learned": [],
        "status": "investigation"
    }

def add_timeline_event(postmortem: dict, timestamp: str, event: str, person: str) -> dict:
    """Add a timeline event to the postmortem."""
    postmortem["timeline"].append({
        "timestamp": timestamp,
        "event": event,
        "reported_by": person
    })
    postmortem["timeline"].sort(key=lambda x: x["timestamp"])
    return postmortem

def add_root_cause(postmortem: dict, cause: str, category: str) -> dict:
    """Add a root cause analysis."""
    postmortem["root_causes"].append({
        "cause": cause,
        "category": category,  # technical/process/unknown
        "contributing_factors": [],
        "severity": "high"
    })
    return postmortem

def add_action_item(postmortem: dict, action: str, owner: str, due_date: str, prevent_type: str) -> dict:
    """Add an action item to prevent recurrence."""
    postmortem["action_items"].append({
        "action": action,
        "owner": owner,
        "due_date": due_date,
        "type": prevent_type,  # prevent/improve/monitor
        "status": "open"
    })
    return postmortem

def record_impact(postmortem: dict, users_affected: int, duration_minutes: int, revenue_impact: float = 0) -> dict:
    """Record the incident impact."""
    postmortem["impact"] = {
        "users_affected": users_affected,
        "duration_minutes": duration_minutes,
        "revenue_impact": revenue_impact,
        "severity": "critical" if users_affected > 1000 else "high" if users_affected > 100 else "medium"
    }
    return postmortem

def finalize_postmortem(postmortem: dict) -> dict:
    """Close the postmortem."""
    postmortem["status"] = "complete"
    postmortem["completed_at"] = datetime.now().isoformat()
    return postmortem

if __name__ == "__main__":
    pmc = create_postmortem("INC-2026-1001", "Database connection pool exhaustion", "2026-10-20T14:30:00Z")
    pmc = add_timeline_event(pmc, "2026-10-20T14:30:00Z", "Alerts fired", "monitoring_team")
    pmc = add_timeline_event(pmc, "2026-10-20T14:35:00Z", "On-call engaged", "alice")
    pmc = add_timeline_event(pmc, "2026-10-20T14:50:00Z", "Incident resolved", "alice")
    pmc = add_root_cause(pmc, "Missing connection pool limit checks", "technical")
    pmc = add_action_item(pmc, "Add connection pool monitoring", "bob", "2026-10-27", "prevent")
    pmc = record_impact(pmc, 5000, 20, 10000.0)
    pmc = finalize_postmortem(pmc)
    print(json.dumps(pmc, indent=2))
