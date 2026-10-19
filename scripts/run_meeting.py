#!/usr/bin/env python3
"""
Meeting Orchestrator
Round-table orchestrator for running and managing meetings
"""

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from skills.meetings import (
    meeting_facilitate,
    meeting_attend,
    meeting_minutes,
    standup_report,
    sprint_planning,
    sprint_review,
    retrospective_kaizen,
    go_no_go,
    postmortem
)

class MeetingOrchestrator:
    def __init__(self):
        self.meetings = {}
        self.handlers = {
            "daily-standup": self.handle_standup,
            "sprint-planning": self.handle_sprint_planning,
            "sprint-review": self.handle_sprint_review,
            "retrospective": self.handle_retrospective,
            "go-no-go": self.handle_go_no_go,
            "postmortem": self.handle_postmortem,
        }

    def handle_standup(self, config: dict) -> dict:
        """Handle standup meeting."""
        report = standup_report.create_standup_report(
            team=config.get("team", "engineering"),
            date=config.get("date", datetime.now().isoformat().split("T")[0])
        )

        for participant in config.get("participants", []):
            report = standup_report.add_standup(
                report,
                participant["name"],
                participant.get("completed", []),
                participant.get("in_progress", []),
                participant.get("blockers", [])
            )

        report = standup_report.summarize_report(report)
        return report

    def handle_sprint_planning(self, config: dict) -> dict:
        """Handle sprint planning meeting."""
        sprint = sprint_planning.create_sprint(
            sprint_num=config.get("sprint_number", 1),
            start_date=config.get("start_date", datetime.now().isoformat()),
            duration_days=config.get("duration_days", 14)
        )

        for goal in config.get("goals", []):
            sprint = sprint_planning.set_sprint_goal(sprint, goal)

        for story in config.get("stories", []):
            sprint = sprint_planning.add_story(
                sprint,
                story["id"],
                story["title"],
                story.get("points", 5),
                story.get("acceptance_criteria", [])
            )

        sprint = sprint_planning.finalize_sprint(sprint)
        return sprint

    def handle_sprint_review(self, config: dict) -> dict:
        """Handle sprint review meeting."""
        review = sprint_review.create_sprint_review(
            sprint_num=config.get("sprint_number", 1),
            date=config.get("date", datetime.now().isoformat().split("T")[0])
        )

        for demo in config.get("demos", []):
            review = sprint_review.add_demo(
                review,
                demo["story_id"],
                demo["title"],
                demo.get("demo_link", "")
            )

        if "metrics" in config:
            review = sprint_review.record_metrics(review, config["metrics"])

        return review

    def handle_retrospective(self, config: dict) -> dict:
        """Handle retrospective meeting."""
        retro = retrospective_kaizen.create_retro(
            sprint_num=config.get("sprint_number", 1),
            date=config.get("date", datetime.now().isoformat().split("T")[0])
        )

        for item in config.get("went_well", []):
            retro = retrospective_kaizen.add_went_well(retro, item["item"], item.get("submitter", "team"))

        for item in config.get("to_improve", []):
            retro = retrospective_kaizen.add_improvement(retro, item["item"], item.get("submitter", "team"))

        for action in config.get("action_items", []):
            retro = retrospective_kaizen.create_action_from_retro(
                retro,
                action.get("from", ""),
                action["action"],
                action.get("owner", "team"),
                action.get("due_date", "")
            )

        morale = config.get("morale", 7)
        retro = retrospective_kaizen.finalize_retro(retro, morale)
        return retro

    def handle_go_no_go(self, config: dict) -> dict:
        """Handle go/no-go decision meeting."""
        decision = go_no_go.create_go_nogo(
            release_name=config.get("release_name", "Release"),
            target_date=config.get("target_date", datetime.now().isoformat().split("T")[0])
        )

        for criterion in config.get("criteria", []):
            decision = go_no_go.add_criteria(
                decision,
                criterion["criterion"],
                criterion.get("status", "unknown"),
                criterion.get("owner", "team")
            )

        for risk in config.get("risks", []):
            decision = go_no_go.add_risk(
                decision,
                risk["risk"],
                risk.get("severity", "medium"),
                risk.get("owner", "team")
            )

        if "decision" in config:
            decision = go_no_go.make_decision(
                decision,
                config["decision"],
                config.get("decision_maker", "lead"),
                config.get("rationale", "")
            )

        return decision

    def handle_postmortem(self, config: dict) -> dict:
        """Handle postmortem meeting."""
        pmc = postmortem.create_postmortem(
            incident_id=config.get("incident_id", "INC-001"),
            incident_name=config.get("incident_name", "Incident"),
            detected_at=config.get("detected_at", datetime.now().isoformat())
        )

        for event in config.get("timeline", []):
            pmc = postmortem.add_timeline_event(
                pmc,
                event["timestamp"],
                event["event"],
                event.get("person", "team")
            )

        for cause in config.get("root_causes", []):
            pmc = postmortem.add_root_cause(pmc, cause["cause"], cause.get("category", "unknown"))

        for action in config.get("action_items", []):
            pmc = postmortem.add_action_item(
                pmc,
                action["action"],
                action.get("owner", "team"),
                action.get("due_date", ""),
                action.get("type", "prevent")
            )

        if "impact" in config:
            pmc = postmortem.record_impact(
                pmc,
                config["impact"].get("users_affected", 0),
                config["impact"].get("duration_minutes", 0),
                config["impact"].get("revenue_impact", 0)
            )

        pmc = postmortem.finalize_postmortem(pmc)
        return pmc

    def run_meeting(self, meeting_type: str, config: dict) -> dict:
        """Run a meeting orchestration."""
        if meeting_type not in self.handlers:
            return {"error": f"Unknown meeting type: {meeting_type}"}

        result = self.handlers[meeting_type](config)
        self.meetings[config.get("id", meeting_type)] = result
        return result

    def get_summary(self) -> dict:
        """Get a summary of all meetings."""
        return {
            "total_meetings": len(self.meetings),
            "meetings": list(self.meetings.keys()),
            "timestamp": datetime.now().isoformat()
        }

def main():
    """Example usage."""
    orchestrator = MeetingOrchestrator()

    # Run a standup
    standup_config = {
        "id": "standup_2026_10_20",
        "team": "engineering",
        "date": "2026-10-20",
        "participants": [
            {
                "name": "alice",
                "completed": ["API endpoint"],
                "in_progress": ["Auth system"],
                "blockers": ["Need DB review"]
            },
            {
                "name": "bob",
                "completed": ["UI tests"],
                "in_progress": ["Performance tuning"],
                "blockers": []
            }
        ]
    }

    standup = orchestrator.run_meeting("daily-standup", standup_config)
    print("Standup Result:")
    print(json.dumps(standup, indent=2))
    print("\n" + "="*50 + "\n")

    # Run sprint planning
    planning_config = {
        "id": "sprint_planning_42",
        "sprint_number": 42,
        "start_date": "2026-10-20",
        "goals": ["Complete authentication system"],
        "stories": [
            {
                "id": "FEAT-100",
                "title": "Implement OAuth2",
                "points": 13,
                "acceptance_criteria": ["Users can login", "Tokens persist"]
            }
        ]
    }

    planning = orchestrator.run_meeting("sprint-planning", planning_config)
    print("Sprint Planning Result:")
    print(json.dumps(planning, indent=2))
    print("\n" + "="*50 + "\n")

    # Summary
    print("Meeting Summary:")
    print(json.dumps(orchestrator.get_summary(), indent=2))

if __name__ == "__main__":
    main()
