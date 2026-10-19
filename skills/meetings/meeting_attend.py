#!/usr/bin/env python3
"""
Meeting Attendance Skill
Track presence, participation, and contributions
"""

import json
from datetime import datetime
from typing import Optional

def attend_meeting(
    meeting_id: str,
    attendee_name: str,
    role: str = "participant"
) -> dict:
    """Record attendance at a meeting."""
    return {
        "meeting_id": meeting_id,
        "attendee": attendee_name,
        "role": role,
        "checkin_time": datetime.now().isoformat(),
        "contributions": [],
        "questions_asked": [],
        "decisions_supported": []
    }

def add_contribution(attendance: dict, contribution: str) -> dict:
    """Add a contribution to meeting participation."""
    attendance["contributions"].append({
        "text": contribution,
        "timestamp": datetime.now().isoformat()
    })
    return attendance

def mark_checkout(attendance: dict) -> dict:
    """Mark when attendee leaves meeting."""
    attendance["checkout_time"] = datetime.now().isoformat()
    return attendance

if __name__ == "__main__":
    attend = attend_meeting("meeting_123", "alice", "engineer")
    attend = add_contribution(attend, "We should prioritize refactoring")
    attend = mark_checkout(attend)
    print(json.dumps(attend, indent=2))
