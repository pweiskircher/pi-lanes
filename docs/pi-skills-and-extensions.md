# pi skills and extensions for lanes

## Goal

Keep pi useful in a lane-oriented workflow without turning the lane system into a heavy framework.

## Skills

### lane-context

Purpose:
- load lane metadata, runtime state, and saved context
- explain the current lane to pi
- keep lane startup grounded in files instead of chat memory

Responsibilities:
- read the current lane id and associated files
- summarize the lane in a compact startup block
- distinguish hot and cold lane context

### lane-status-summary

Purpose:
- keep lane summaries short and phone-friendly

Suggested output format:
- what changed
- what is next
- what needs input

### lane-ci-investigation

Purpose:
- teach pi how to check CI for the current lane with a gh-first workflow
- inspect GitHub checks first, including Buildkite-backed checks surfaced through GitHub
- investigate the first actionable failure and summarize it for the human
- stop before making changes unless explicitly asked

### manager-lane-review

Purpose:
- help a future manager compare lanes and route attention

Focus:
- stale lanes
- blocked lanes
- pending human input
- missing context updates

## Extensions

### lane commands extension

Likely commands:
- `/lane-status`

### lane runtime extension

Purpose:
- write current lane runtime state in a structured format
- update operational state such as `mode` and live bridge info

### lane dashboard bridge extension

Purpose:
- expose state or events that an external dashboard can consume
- keep the TUI and dashboard aligned on lane identity

## Current repo scaffolding

This repo now includes:
- `skills/lane-context/SKILL.md`
- `skills/lane-status-summary/SKILL.md`
- `extensions/lane-bridge.ts`
- `.pi/settings.json`

The extension is still intentionally small, but it now provides:
- automatic lane session naming on session start when it can match the current lane id or repo
- `/lane-status`
- a localhost-only live-message bridge for active lane sessions

The dashboard complements those commands with HTTP-based editing for:
- lane context
- live message delivery into active lane sessions
- live idle/busy session health
- recent lane event history

## Suggested priority

Implement in this order:
1. `lane-context` skill
2. lane runtime extension
3. lane commands extension
4. manager-oriented pieces

## Guardrails

- Prefer plain files and explicit commands over hidden magic.
- Keep lane rules visible in data and prompts.
- Let the dashboard inspect and edit state, but keep transition validation centralized.
