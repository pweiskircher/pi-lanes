# pi lanes

A lane-based workflow, CLI, and dashboard for pi.

This repo provides:
- a CLI for creating, starting, inspecting, and deleting lanes
- lane-scoped context, TODOs, runtime state, and event history
- a local dashboard for steering active lane sessions
- lane-aware pi skills and an extension-backed message bridge

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

This repo contains the tooling implementation. Actual lane data lives by default in `~/.config/pi-lanes/`.

Key directories:
- `bin/` — CLI entrypoints
- `src/` — CLI and lane logic
- `dashboard-app/` — Preact dashboard source
- `dashboard/` — built dashboard assets served by the backend
- `skills/` — lane-oriented pi skills
- `extensions/` — lane-oriented pi extension(s)
- `docs/` — supporting docs
- `schemas/` — JSON schemas for lane data files
- `examples/` — example lane files
- `.pi/` — local pi project config used for dogfooding
- `test/` — tests

## Core model

- **Lane**: a durable unit of work with repo, session name, lane context, and TODOs.
- **Hot lane**: a lane currently running in a terminal.
- **Cold lane**: a lane with saved state but no live terminal session.
- **TODO**: a lane-scoped work item.
- **Proposed TODO**: an LLM-created TODO that requires review.

## Current implementation status

Implemented now:
- `pi-lane new [<lane-id>] [--repo <path>] ... [--json]`
- `pi-lane start <lane-id> [-c|--continue] [--dry-run] [--json]`
- `pi-lane delete <lane-id> [--yes] [--json]`
- `pi-lane list [--json]`
- `pi-lane show <lane-id> [--json]`
- `pi-lane doctor [--json]`
- `pi-lane dashboard snapshot [--json]`
- `pi-lane dashboard serve [--port 4310]`
- `pi-lane todo list|add|edit|delete|set-status|approve|reject ...`
- `pi-lane runtime show|set-current-todo|clear-current-todo|set-mode ...`
- `pi-lane context show|edit ...`
- `pi-lane-start <lane-id> [-c|--continue]` via `bin/pi-lane-start.mjs`
- new-lane onboarding on first fresh start
- lane-scoped live messaging and live assistant-output streaming in the dashboard
- lane-scoped context, TODOs, runtime state, and event history stored under `~/.config/pi-lanes/lanes/<lane-id>/`

## Installation

### Local development

1. Install dependencies:
   - `npm install`
2. Optionally expose the CLI globally while developing:
   - `npm link`

### Global install

From the repo root, you can also install the binaries directly:
- `npm install -g .`

This provides:
- `pi-lane`
- `pi-lane-start`

## Quick start

1. Create a lane:
   - from inside a repo: `pi-lane new mt-core`
   - or explicitly: `pi-lane new mt-core --repo /path/to/repo`
2. Lane data is stored in `~/.config/pi-lanes/` by default.
3. Each lane gets its own directory under `~/.config/pi-lanes/lanes/<lane-id>/`.
   - context: `~/.config/pi-lanes/lanes/<lane-id>/context.md`
   - runtime: `~/.config/pi-lanes/lanes/<lane-id>/state/runtime.json`
   - todos: `~/.config/pi-lanes/lanes/<lane-id>/state/todos.json`
   - events: `~/.config/pi-lanes/lanes/<lane-id>/state/events.json`
4. Run a health check:
   - `pi-lane doctor`
5. Start a lane:
   - fresh start: `pi-lane-start <lane-id>`
   - continue an existing saved pi session: `pi-lane-start <lane-id> --continue`
   - on a brand-new lane, pi uses the first conversation to onboard the lane, capture context, and optionally draft proposed TODOs.
6. Inspect lanes:
   - `pi-lane list`
   - `pi-lane show <lane-id>`
7. Delete a lane:
   - `pi-lane delete <lane-id>`
   - `pi-lane delete <lane-id> --yes`
8. For dashboard-friendly output, use JSON mode:
   - `pi-lane list --json`
   - `pi-lane show <lane-id> --json`
   - `pi-lane dashboard snapshot --json`
   - `pi-lane todo list <lane-id> --json`
   - `pi-lane doctor --json`
9. Build and run the local dashboard:
   - `npm run dashboard:build`
   - `pi-lane dashboard serve --port 4310`

For frontend development with hot reload:
- one-command mode: `npm run dashboard:dev:full`
- open `http://127.0.0.1:4311`

Or run the pieces separately:
- start the backend API/server: `pi-lane dashboard serve --port 4310`
- in another terminal, start Vite: `npm run dashboard:dev`
- open `http://127.0.0.1:4311`

The Vite dev server proxies `/api/*` to the dashboard backend on port `4310`.

The dashboard currently supports:
- lane list and detail views
- faster lane switching using snapshot-backed client state
- live lane health and idle/busy state
- recent conversation with live in-progress assistant output
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

## Notes

- The dashboard serves built assets from `dashboard/dist/`.
- For active development, use `npm run dashboard:dev:full`.
- Lane TODOs do not auto-start.
- LLM-proposed TODOs stay `proposed` until a human approves them.