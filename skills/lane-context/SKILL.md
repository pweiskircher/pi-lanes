---
name: lane-context
description: Load the current lane's metadata, runtime state, and saved context before doing lane-oriented work. Use when working inside a pi lane session or when the user refers to the current lane, lane state, or dashboard-visible status.
user-invocable: true
---

# lane-context

## Purpose

Use this skill to ground pi in the current lane before making decisions.

A lane is the unit of work. The lane's metadata, runtime state, and lane context file are the source of truth for:
- what this lane is
- which repository it uses
- what the dashboard sees
- what mode the lane is in
- what lane-specific notes or rules apply

## Required reads

Before doing lane-aware work, read these files when they exist:

1. `~/.config/pi-lanes/lanes.json`
2. `~/.config/pi-lanes/lanes/<lane-id>/state/runtime.json`
3. `~/.config/pi-lanes/lanes/<lane-id>/context.md`

If the lane id is unclear, ask the user or infer it from the active lane session and lane briefing.

## Behavior rules

- Treat lane files as source of truth over chat memory.
- Keep dashboard-visible updates short and concrete.
- Do not invent lane metadata.
- Do not silently change lane runtime state unless the user asked for it or the surrounding command explicitly exists for that purpose.
- If you discover useful follow-up work, surface it in the conversation or lane context instead of inventing hidden tracking state.

## Summary format

When asked for a lane summary, prefer:
- what changed
- what is next
- what needs input

Keep it compact enough for phone review.
