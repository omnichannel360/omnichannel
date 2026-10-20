---
name: standup-report
description: Collect daily standup updates on work progress, blockers, and dependencies
type: meeting_facilitator
triggers: ["standup", "daily standup", "what's done", "blockers"]
cadence: daily
owner: team
dependencies: ["task_tracking"]
---

# Standup Report Skill

## Purpose
Run daily standups: collect what's done, what's next, and blockers from team members.

## Trigger Keywords
- "standup"
- "daily standup"
- "what's done"
- "blockers"

## Input Schema
```json
{"date": "ISO date", "attendees": ["string"], "reports": [{"person": "string", "what_done": "string", "what_next": "string", "blockers": ["string"]}]}
```

## Output Schema
```json
{"date": "ISO date", "total_attendees": "integer", "blockers": ["string"], "dependencies": ["string"], "summary": "string"}
```

## Related Skills
- sprint-planning
- retrospective
