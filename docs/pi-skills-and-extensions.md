# pi skills and extensions for lanes

## Goal

Keep pi useful in a lane-oriented workflow without turning the lane system into a heavy framework.

## Skills

### lane-context

Purpose:
- load lane metadata, TODOs, and runtime state
- explain the current lane to pi
- remind pi that TODOs require explicit human start

Responsibilities:
- read the current lane id and associated files
- summarize the lane in a compact startup block
- distinguish hot and cold lane context

### lane-todo-hygiene

Purpose:
- teach pi how to work with lane TODOs safely

Rules:
- do not auto-start TODOs
- use `proposed` for LLM-created TODOs
- set `createdBy: "llm"`
- set `needsReview: true`
- require `proposalReason`
- avoid turning vague ideas into TODOs unless they are actionable

### lane-status-summary

Purpose:
- keep lane summaries short and phone-friendly

Suggested output format:
- what changed
- what is next
- what needs input

### manager-lane-review

Purpose:
- help a future manager compare lanes and route attention

Focus:
- stale lanes
- blocked lanes
- pending human input
- TODO review backlog

## Extensions

### lane commands extension

Likely commands:
- `/lane-status`
- `/lane-brief`
- `/lane-todos`
- `/lane-add-todo`
- `/lane-propose-todo`
- `/lane-set-current-todo`

### lane runtime extension

Purpose:
- write current lane runtime state in a structured format
- update `currentSummary`, `currentTodoId`, and `needsInput`

### lane dashboard bridge extension

Purpose:
- expose state or events that an external dashboard can consume
- keep the TUI and dashboard aligned on lane identity

## Current repo scaffolding

This repo now includes:
- `skills/lane-context/SKILL.md`
- `skills/lane-todo-hygiene/SKILL.md`
- `skills/lane-status-summary/SKILL.md`
- `extensions/lane-bridge.ts`
- `.pi/settings.json`

The extension is still intentionally small, but it now provides:
- automatic lane session naming on session start when it can match the current lane id or repo
- `/lane-status`
- `/lane-todos`
- `/lane-set-summary`
- `/lane-set-needs-input`
- `/lane-set-current-todo`
- `lane_propose_todo` for LLM-proposed TODO capture

The dashboard now complements those commands with HTTP-based editing for:
- runtime summary
- needs-input state
- current TODO
- runtime mode
- lane TODO CRUD and review actions

## Suggested priority

Implement in this order:
1. `lane-context` skill
2. `lane-todo-hygiene` skill
3. lane runtime extension
4. lane commands extension
5. manager-oriented pieces

## Guardrails

- Prefer plain files and explicit commands over hidden magic.
- Keep lane rules visible in data and prompts.
- Let the dashboard inspect and edit state, but keep transition validation centralized.
- Avoid any extension that silently starts work on an open TODO.