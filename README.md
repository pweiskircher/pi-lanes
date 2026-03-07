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

- `docs/design-plans/pi-lanes-v1.md` — V1 design
- `docs/plans/pi-lanes-v1-implementation.md` — staged implementation plan
- `docs/pi-skills-and-extensions.md` — proposed pi customizations
- `schemas/` — JSON Schemas for lane data files
- `examples/` — example lane files

## Core model

- **Lane**: a durable unit of work with workspace, session name, port, and TODOs.
- **Hot lane**: a lane currently running in a terminal.
- **Cold lane**: a lane with saved state but no live terminal session.
- **TODO**: a lane-scoped work item.
- **Proposed TODO**: an LLM-created TODO that requires review.

## Next step

Implement `pi-lane-start`, lane storage, lane runtime state updates, and dashboard CRUD for TODOs.