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

This repo contains the tooling implementation. Actual lane data now lives by default in `~/.config/pi-lanes/`.

Repo contents:
- `docs/design-plans/pi-lanes-v1.md` — V1 design
- `docs/plans/pi-lanes-v1-implementation.md` — staged implementation plan
- `docs/pi-skills-and-extensions.md` — proposed pi customizations
- `schemas/` — JSON Schemas for lane data files
- `examples/` — example lane files
- `src/` — CLI and lane logic
- `skills/` — lane-oriented pi skills
- `extensions/` — lane-oriented pi extension(s)
- `.pi/` — local pi project config
- `test/` — focused tests for pure lane logic

## Core model

- **Lane**: a durable unit of work with repo, session name, lane context, and TODOs.
- **Hot lane**: a lane currently running in a terminal.
- **Cold lane**: a lane with saved state but no live terminal session.
- **TODO**: a lane-scoped work item.
- **Proposed TODO**: an LLM-created TODO that requires review.

## Current implementation status

Implemented now:
- `pi-lane new [<lane-id>] [--repo <path>] ... [--json]`
- `pi-lane doctor [--json]`
- `pi-lane-start <lane-id> [-c|--continue]` via `bin/pi-lane-start.mjs`
- `pi-lane list [--json]`
- `pi-lane show <lane-id> [--json]`
- `pi-lane delete <lane-id> [--yes] [--json]`
- `pi-lane dashboard snapshot [--json]`
- `pi-lane dashboard serve [--port 4310]`
- `pi-lane todo list <lane-id> [--json]`
- `pi-lane todo add <lane-id> --title ... [--json]`
- `pi-lane todo edit <lane-id> <todo-id> ... [--json]`
- `pi-lane todo delete <lane-id> <todo-id> [--json]`
- `pi-lane todo set-status <lane-id> <todo-id> <status> [--json]`
- `pi-lane todo approve <lane-id> <todo-id> [--json]`
- `pi-lane todo reject <lane-id> <todo-id> [--json]`
- `pi-lane runtime show <lane-id> [--json]`
- `pi-lane runtime set-current-todo <lane-id> <todo-id> [--json]`
- `pi-lane runtime clear-current-todo <lane-id> [--json]`
- `pi-lane runtime set-mode <lane-id> <mode> [--json]`
- `pi-lane context show <lane-id> [--json]`
- `pi-lane context edit <lane-id> [--text ...] [--editor ...] [--json]`
- runtime state file updates on lane start and stop
- doctor checks for lane config, repo paths, TODO/runtime files, lane context files, and pi availability
- validation and tests for TODO transitions, runtime state, and lane creation
- CLI parsing now uses `commander` instead of hand-rolled flag parsing
- starter pi skills for lane context, TODO hygiene, and compact lane summaries
- project-local pi settings and AGENTS notes for this repo
- `pi-lane-start` now injects the lane extension and skills into pi sessions

## Quick start

1. Install dependencies:
   - `npm install`
2. Create a lane:
   - from inside a repo: `node bin/pi-lane.mjs new mt-core`
   - or explicitly: `node bin/pi-lane.mjs new mt-core --repo /path/to/repo`
3. Lane data is stored in `~/.config/pi-lanes/` by default.
4. Each lane gets its own directory under `~/.config/pi-lanes/lanes/<lane-id>/`.
   - context: `~/.config/pi-lanes/lanes/<lane-id>/context.md`
   - runtime: `~/.config/pi-lanes/lanes/<lane-id>/state/runtime.json`
   - todos: `~/.config/pi-lanes/lanes/<lane-id>/state/todos.json`
   - events: `~/.config/pi-lanes/lanes/<lane-id>/state/events.json`
5. Run a health check:
   - `node bin/pi-lane.mjs doctor`
6. Start a lane:
   - fresh start: `node bin/pi-lane-start.mjs <lane-id>`
   - continue an existing saved pi session: `node bin/pi-lane-start.mjs <lane-id> --continue`
   - on a brand-new lane, pi will use the first conversation to help onboard the lane, capture context, and optionally draft proposed TODOs.
7. Inspect lanes:
   - `node bin/pi-lane.mjs list`
   - `node bin/pi-lane.mjs show <lane-id>`
8. For dashboard-friendly output, use JSON mode:
   - `node bin/pi-lane.mjs list --json`
   - `node bin/pi-lane.mjs show <lane-id> --json`
   - `node bin/pi-lane.mjs dashboard snapshot --json`
   - `node bin/pi-lane.mjs todo list <lane-id> --json`
   - `node bin/pi-lane.mjs doctor --json`
9. Build and run the local dashboard:
   - `npm run dashboard:build`
   - `node bin/pi-lane.mjs dashboard serve --port 4310`

For frontend development with hot reload:
- one-command mode: `npm run dashboard:dev:full`
- open `http://127.0.0.1:4311`

Or run the pieces separately:
- start the backend API/server: `node bin/pi-lane.mjs dashboard serve --port 4310`
- in another terminal, start Vite: `npm run dashboard:dev`
- open `http://127.0.0.1:4311`

The Vite dev server proxies `/api/*` to the dashboard backend on port `4310`.

The dashboard currently supports:
- lane list and detail views
- live lane health and idle/busy state
- lane context editing
- live message delivery into active lane sessions
- recent lane event history
- TODO add/edit/delete
- TODO approve/reject
- TODO status changes

Lane-specific context works like a lightweight per-lane AGENTS-style note:
- `~/.config/pi-lanes/lanes/<lane-id>/context.md`
- `pi-lane new` creates it automatically
- `pi-lane-start` loads it into the startup prompt for fresh sessions

## Included pi workflow scaffolding

- `skills/lane-context/SKILL.md`
- `skills/lane-todo-hygiene/SKILL.md`
- `skills/lane-status-summary/SKILL.md`
- `extensions/lane-bridge.ts`
- `.pi/settings.json`
- `.pi/AGENTS.md`

These are now wired into the repo and the lane startup flow. The extension is still intentionally small, but it now provides real lane commands, an LLM-facing TODO proposal tool, and a local live-message bridge for active dashboard-controlled sessions.

Lane startup prompt injection now explicitly tells pi to use the lane-specific TODO mechanism:
- `lane_propose_todo` for LLM-proposed follow-up work
- lane CLI/dashboard commands for human TODO management
- not any generic TODO extension/tool

## Next step

Add richer manager workflows on top of the lane model, and refine the live-message/dashboard experience now that lane context editing and session messaging are wired in.