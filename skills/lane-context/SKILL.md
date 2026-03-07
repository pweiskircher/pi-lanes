---
name: lane-context
description: Load the current lane's metadata, runtime state, and TODOs before doing lane-oriented work. Use when working inside a pi lane session or when the user refers to the current lane, current TODO, lane state, or dashboard-visible status.
user-invocable: true
---

# lane-context

## Purpose

Use this skill to ground pi in the current lane before making decisions.

A lane is the unit of work. The lane's metadata, TODOs, runtime state, and lane context file are the source of truth for:
- what this lane is
- which repository it uses
- what TODOs exist
- what the dashboard sees
- what the current TODO and needs-input prompt are
- what lane-specific notes or rules apply

## Required reads

Before doing lane-aware work, read these files when they exist:

1. `~/.config/pi-lanes/lanes.json`
2. `~/.config/pi-lanes/state/runtime/<lane-id>.json`
3. `~/.config/pi-lanes/state/todos/<lane-id>.json`
4. `~/.config/pi-lanes/context/<lane-id>.md`

If the lane id is unclear, ask the user or infer it from the active lane session and lane briefing.

## Behavior rules

- Treat lane files as source of truth over chat memory.
- Keep dashboard-visible updates short and concrete.
- If you mention TODOs, use their ids.
- Do not invent lane metadata.
- Do not silently change lane runtime state unless the user asked for it or the surrounding command explicitly exists for that purpose.

## TODO rules

- TODOs do not auto-start.
- A TODO starts only after explicit human instruction.
- LLM-created TODOs must remain `proposed` until reviewed.
- If you discover useful follow-up work, propose a TODO instead of silently broadening scope.
- Use the lane-specific TODO path only:
  - `lane_propose_todo` for LLM-created lane TODOs
  - lane CLI/dashboard commands for human TODO changes
- Do not use generic TODO extensions or unrelated TODO tools for lane work.

## Summary format

When asked for a lane summary, prefer:
- what changed
- what is next
- what needs input

Keep it compact enough for phone review.