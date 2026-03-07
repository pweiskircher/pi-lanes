# pi lanes V1 implementation plan

## Goal

Build the smallest useful version of the lane workflow.

## Phase 1: data model and fixtures

Deliverables:
- `schemas/lanes.schema.json`
- `schemas/lane-todos.schema.json`
- `schemas/lane-runtime.schema.json`
- example files under `examples/`

Acceptance criteria:
- lane metadata format is stable enough to implement against
- TODO review workflow is represented in data
- runtime state format is clear enough for dashboard and TUI integration

## Phase 2: local lane bootstrap

Deliverables:
- `pi-lane-start` script or CLI
- lane lookup and validation
- workspace switching
- pi session resume/create policy
- runtime state initialization

Acceptance criteria:
- a valid lane can be started from one command
- bad lane config fails early with useful errors
- runtime state reflects whether a lane is hot or cold

## Phase 3: TODO CRUD

Deliverables:
- create, edit, delete, and status transition helpers
- support for proposed TODO approval and rejection
- auditable handling for dropped TODOs

Acceptance criteria:
- humans can manage lane TODOs cleanly
- LLM proposals are always reviewable before becoming open work
- TODO transitions are validated

## Phase 4: pi integration

Deliverables:
- lane-aware pi skill set
- lane runtime state update helpers
- commands or extension hooks for TODO visibility and proposal creation

Acceptance criteria:
- pi can read lane context reliably
- pi can propose TODOs in a structured format
- pi does not auto-start TODOs

## Phase 5: dashboard integration

Deliverables:
- lane list view
- lane detail view
- TODO CRUD and review actions
- live lane status display

Acceptance criteria:
- dashboard can inspect hot and cold lanes
- dashboard can manage TODOs without bypassing validation rules
- proposed TODOs are easy to review from phone

## Phase 6: manager layer

Deliverables:
- lane summary synthesis
- pending-input aggregation
- lane prioritization support

Acceptance criteria:
- manager improves routing and visibility
- manager does not own lane execution
- manager does not silently start work

## Technical approach

### Functional Core

Pure logic should own:
- lane schema validation results
- TODO transition rules
- review approval and rejection state changes
- lane summary formatting helpers

### Imperative Shell

Shell code should own:
- reading and writing files
- launching or resuming pi
- session inspection
- dashboard transport
- optional lock management

## First implementation recommendation

Start with a simple TypeScript CLI and JSON files.

Suggested initial commands after `pi-lane-start`:
- `pi-lane-list`
- `pi-lane-show <lane-id>`
- `pi-lane-todo add <lane-id>`
- `pi-lane-todo approve <lane-id> <todo-id>`
- `pi-lane-todo reject <lane-id> <todo-id>`

Only `pi-lane-start` is required for V1. The rest can follow once the model is stable.

## Risks

- over-designing the manager too early
- building dashboard-specific logic into lane core files
- allowing TODO states to drift due to weak validation
- making `pi-lane-start` too magical or fragile

## Recommended next build order

1. validate and lock the schemas
2. implement `pi-lane-start`
3. implement TODO transition helpers
4. add dashboard CRUD
5. add pi skills and extensions
6. revisit manager design