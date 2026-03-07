# pi lanes

A lane-based workflow for pi.

This repo defines a V1 for working across multiple concurrent efforts while keeping pi usable from both the TUI and a phone-friendly dashboard.

## V1 goals

- Treat each active effort as a lane.
- Start a lane with one command: `pi-lane-start <lane-id>`.
- Keep the TUI as the primary local interface.
- Expose enough structured state for a dashboard to inspect live and cold lanes.
- Give each lane its own TODO list.
- Let LLMs propose TODOs, but require human review before they become normal work items.
- Never auto-start TODOs. A human explicitly starts work.

## V1 non-goals

- No background workers.
- No automatic TODO execution.
- No requirement that the dashboard can fully replace the TUI.
- No requirement that a manager orchestrator exists before lane basics are stable.

## Repo layout

- `config/` — lane registry
- `state/runtime/` — per-lane runtime state files
- `state/todos/` — per-lane TODO files
- `docs/design-plans/pi-lanes-v1.md` — V1 design
- `docs/plans/pi-lanes-v1-implementation.md` — staged implementation plan
- `docs/pi-skills-and-extensions.md` — proposed pi customizations
- `schemas/` — JSON Schemas for lane data files
- `examples/` — example lane files
- `src/` — CLI and lane logic
- `test/` — focused tests for pure lane logic

## Core model

- **Lane**: a durable unit of work with workspace, session name, port, and TODOs.
- **Hot lane**: a lane currently running in a terminal.
- **Cold lane**: a lane with saved state but no live terminal session.
- **TODO**: a lane-scoped work item.
- **Proposed TODO**: an LLM-created TODO that requires review.

## Current implementation status

Implemented now:
- `pi-lane-start <lane-id>` via `bin/pi-lane-start.mjs`
- `pi-lane list [--json]`
- `pi-lane show <lane-id> [--json]`
- `pi-lane todo list <lane-id> [--json]`
- `pi-lane todo add <lane-id> --title ... [--json]`
- `pi-lane todo edit <lane-id> <todo-id> ... [--json]`
- `pi-lane todo delete <lane-id> <todo-id> [--json]`
- `pi-lane todo set-status <lane-id> <todo-id> <status> [--json]`
- `pi-lane todo approve <lane-id> <todo-id> [--json]`
- `pi-lane todo reject <lane-id> <todo-id> [--json]`
- `pi-lane runtime show <lane-id> [--json]`
- `pi-lane runtime set-summary <lane-id> --text ... [--json]`
- `pi-lane runtime set-question <lane-id> --text ... [--json]`
- `pi-lane runtime set-current-todo <lane-id> <todo-id> [--json]`
- `pi-lane runtime clear-current-todo <lane-id> [--json]`
- `pi-lane runtime set-mode <lane-id> <mode> [--json]`
- `pi-lane runtime set-last-human-instruction <lane-id> --text ... [--json]`
- runtime state file updates on lane start and stop
- validation and tests for TODO transitions and runtime state
- CLI parsing now uses `cac` instead of hand-rolled flag parsing

## Quick start

1. Install dependencies:
   - `npm install`
2. Copy `examples/lanes.example.json` into `config/lanes.json` and adapt it.
3. Create any real lane workspaces you reference.
4. Start a lane:
   - `node bin/pi-lane-start.mjs <lane-id>`
5. Inspect lanes:
   - `node bin/pi-lane.mjs list`
   - `node bin/pi-lane.mjs show <lane-id>`
6. For dashboard-friendly output, use JSON mode:
   - `node bin/pi-lane.mjs list --json`
   - `node bin/pi-lane.mjs show <lane-id> --json`
   - `node bin/pi-lane.mjs todo list <lane-id> --json`

## Next step

Improve pi session integration, connect the dashboard to the shared runtime and TODO files, and add lane-aware pi skills/extensions.