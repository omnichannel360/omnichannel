#!/usr/bin/env python3
"""
Sprint Review Skill
Demonstrate completed work and gather stakeholder feedback
"""

import json
from datetime import datetime

def create_sprint_review(sprint_num: int, date: str) -> dict:
    """Create a sprint review meeting record."""
    return {
        "sprint_number": sprint_num,
        "date": date,
        "created_at": datetime.now().isoformat(),
        "demo_items": [],
        "feedback": [],
        "metrics": {},
        "attendees": [],
        "status": "scheduled"
    }

def add_demo(review: dict, story_id: str, title: str, demo_link: str) -> dict:
    """Add a demo item to the review."""
    review["demo_items"].append({
        "story_id": story_id,
        "title": title,
        "demo_link": demo_link,
        "feedback_received": []
    })
    return review

def add_feedback(review: dict, story_id: str, feedback_text: str, from_person: str) -> dict:
    """Add feedback on a demo item."""
    for item in review["demo_items"]:
        if item["story_id"] == story_id:
            item["feedback_received"].append({
                "from": from_person,
                "feedback": feedback_text,
                "timestamp": datetime.now().isoformat()
            })
    return review

def record_metrics(review: dict, metrics: dict) -> dict:
    """Record sprint metrics."""
    review["metrics"] = {
        "points_completed": metrics.get("points_completed", 0),
        "points_planned": metrics.get("points_planned", 0),
        "velocity": metrics.get("velocity", 0),
        "deployment_count": metrics.get("deployment_count", 0)
    }
    return review

if __name__ == "__main__":
    review = create_sprint_review(42, "2026-10-27")
    review = add_demo(review, "FEAT-100", "OAuth2 Login", "https://demo.local/auth")
    review = add_feedback(review, "FEAT-100", "Looks great! Test across browsers", "stakeholder1")
    review = record_metrics(review, {"points_completed": 18, "points_planned": 21, "velocity": 18})
    print(json.dumps(review, indent=2))
