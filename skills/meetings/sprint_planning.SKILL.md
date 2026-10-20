---
name: sprint-planning
description: Plan sprint goals, stories, and capacity for upcoming sprint cycle
type: meeting_facilitator
triggers: ["plan sprint", "sprint planning", "sprint goals", "story estimation"]
cadence: weekly
owner: product_team
dependencies: ["backlog_management", "capacity_planning"]
---

# Sprint Planning Skill

## Purpose
Facilitate sprint planning meetings: define goals, estimate stories, verify capacity, and commit to sprint work.

## Trigger Keywords
- "plan sprint"
- "sprint planning"
- "sprint goals"
- "story estimation"

## Input Schema
```json
{
  "sprint_number": "integer",
  "start_date": "ISO date (2026-10-20)",
  "duration_days": "integer (14)",
  "goals": ["string array"],
  "stories": [{"id": "string", "title": "string", "points": "integer", "acceptance_criteria": ["string"]}]
}
```

## Output Schema
```json
{
  "sprint_number": "integer",
  "start_date": "ISO date",
  "end_date": "ISO date",
  "goals": ["object array"],
  "stories": ["object array"],
  "total_points": "integer",
  "status": "committed"
}
```

## Related Skills
- backlog-grooming
- retrospective
- sprint-review
