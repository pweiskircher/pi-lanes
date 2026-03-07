# pi lanes V1

## Summary

V1 introduces a lane-based workflow for pi.

A lane is a named unit of work with:
- a workspace path
- a jj bookmark
- a fixed dev server port
- a pi session name
- a lane-scoped TODO list
- shared runtime state for dashboard visibility

A lane only does work while its pi session is running in a terminal. The same live session supports both direct TUI use and remote steering from a dashboard.

## Definition of done

V1 is done when this system has:
- a concrete lane metadata format
- a concrete per-lane TODO format
- a concrete runtime state format for active and inactive lanes
- a contract for `pi-lane-start <lane-id>`
- a dashboard interaction contract for lane TODO CRUD and LLM TODO review
- a clear list of pi extensions and skills that should exist to support the workflow

V1 does not require:
- background daemons that continue working without an open terminal
- automatic TODO selection or execution
- a complete manager implementation

## Design principles

### Lane-first

Lanes are the main abstraction. Sessions, ports, workspaces, and TODOs hang off a lane.

### TUI-first locally

The dashboard complements the TUI. It does not replace it.

### Shared lane state

The TUI, dashboard, and future manager must read and write the same lane data model.

### Explicit human control

The user decides when a TODO starts. Pi does not auto-pick TODOs in V1.

### Review before trust

LLM-created TODOs are always marked for review before they join the normal queue.

## Concepts

### Lane

A lane is a durable work context.

Required lane fields:
- `id`
- `title`
- `workspacePath`
- `repoPath`
- `jjBookmark`
- `port`
- `sessionName`

Optional lane fields:
- `serverCommand`
- `priority`
- `status`
- `notes`
- `tags`

### Hot and cold lanes

A lane is either:
- **hot**: a live pi session is running in a terminal for that lane
- **cold**: the lane is not running, but its metadata, session history, and TODOs still exist

### TODO

A TODO belongs to exactly one lane.

A TODO can be:
- `proposed`
- `open`
- `in_progress`
- `blocked`
- `done`
- `dropped`

### TODO provenance

TODO provenance is explicit:
- `createdBy: "human"`
- `createdBy: "llm"`

If `createdBy` is `llm`, then V1 requires:
- `needsReview: true`
- initial status `proposed`
- a short `proposalReason`

## Lane metadata

Lane metadata should live in a single file such as `config/lanes.json`.

Example:

```json
[
  {
    "id": "mt-core",
    "title": "Multithreading large subsystem",
    "workspacePath": "/Users/pat/Work/project/workspaces/mt-core",
    "repoPath": "/Users/pat/Work/project",
    "jjBookmark": "pat/mt-core",
    "port": 3001,
    "sessionName": "mt-core",
    "serverCommand": "pnpm dev --port 3001",
    "priority": "main",
    "status": "active"
  }
]
```

### Port policy

Ports should be deterministic and stored in lane metadata. They should not be rediscovered at runtime.

### Workspace policy

Major efforts should use separate jj workspaces. That keeps diffs, servers, and pi context isolated.

## TODO model

Each lane has a dedicated TODO file such as `state/todos/<lane-id>.json`.

Example:

```json
{
  "laneId": "pdfua-paragraphs",
  "todos": [
    {
      "id": "todo-001",
      "title": "Compare hybrid heuristic against 5 tagged PDFs",
      "notes": "Focus on failures near list boundaries.",
      "status": "open",
      "priority": "high",
      "createdBy": "human",
      "needsReview": false,
      "createdAt": "2026-03-07T14:00:00Z",
      "updatedAt": "2026-03-07T14:00:00Z"
    },
    {
      "id": "todo-002",
      "title": "Check whether nested Span tags break paragraph grouping",
      "notes": "Suggested during sample analysis.",
      "status": "proposed",
      "priority": "medium",
      "createdBy": "llm",
      "needsReview": true,
      "proposalReason": "Observed inconsistent grouping in one tagged sample where nested spans interrupted paragraph inference.",
      "createdAt": "2026-03-07T14:05:00Z",
      "updatedAt": "2026-03-07T14:05:00Z"
    }
  ]
}
```

## TODO behavior rules

### Human-created TODOs

Human-created TODOs:
- start as `open` unless explicitly marked otherwise
- do not require review

### LLM-created TODOs

LLM-created TODOs:
- start as `proposed`
- require `needsReview: true`
- must include `proposalReason`
- do not become `open` until approved by a human

### Starting work

V1 rule: pi never starts TODOs automatically.

Work begins only when a human gives an explicit instruction such as:
- “Start TODO todo-001”
- “Work on the first open TODO”
- “Continue the in-progress TODO”

## Runtime state

Runtime state should be persisted in a small machine-readable file per lane, such as `state/runtime/<lane-id>.json`.

This file is the shared contract between:
- `pi-lane-start`
- the dashboard
- future manager logic

Suggested fields:
- `laneId`
- `isActive`
- `startedAt`
- `updatedAt`
- `sessionName`
- `sessionId` when available
- `workspacePath`
- `port`
- `mode`
- `currentTodoId`
- `currentSummary`
- `needsInput`
- `lastHumanInstruction`

### Runtime modes

Suggested V1 runtime modes:
- `idle`
- `interactive`
- `working`
- `waiting_for_input`
- `blocked`
- `stopped`

These are observational states. They do not imply background execution.

## `pi-lane-start` contract

`pi-lane-start <lane-id>` is the main local entrypoint.

### Responsibilities

It should:
1. load lane metadata
2. validate the requested lane exists
3. validate the workspace path exists
4. switch into the lane workspace
5. resume the named pi session if possible, otherwise create one
6. ensure the session name matches lane metadata
7. initialize or update the lane runtime state file
8. optionally print a short lane briefing before entering pi

### Suggested briefing content

The startup briefing should be compact and include:
- lane name
- goal/title
- workspace path
- jj bookmark
- port
- latest summary
- current in-progress TODO, if any
- count of open and proposed TODOs

### Validation

`pi-lane-start` should fail early with useful errors if:
- the lane id does not exist
- the workspace path is missing
- the lane metadata is invalid
- another live process already claims the lane runtime lock, if lock support is added

## Dashboard contract

The dashboard does not replace the TUI. In V1 it focuses on visibility and control.

### Lane list view

Per lane, show:
- title and id
- active or inactive state
- workspace or repo summary
- port
- current summary
- current TODO
- counts for open, proposed, blocked, and done TODOs

### Lane detail view

Show:
- full lane metadata
- runtime state
- full TODO list grouped by status
- pending review TODOs
- recent summary and needs-input text

### TODO actions

The dashboard must support:
- create TODO
- edit TODO
- delete TODO
- mark TODO status
- approve LLM-proposed TODO
- reject LLM-proposed TODO

### Review actions

Approving a proposed TODO should:
- set `needsReview` to `false`
- move status from `proposed` to `open`
- preserve provenance and original proposal reason

Rejecting a proposed TODO should either:
- delete it, or
- mark it `dropped`

V1 should prefer `dropped` so proposals remain auditable.

## Manager role in V1

A manager is optional in V1.

If added later, the manager should:
- summarize active and inactive lanes
- identify lanes that need human input
- help decide which lane to open next
- never silently start TODOs

## Skills and extensions needed in pi

V1 likely needs a small set of pi customizations.

### Skills

#### 1. lane-context

Purpose:
- teach pi how to read lane metadata, runtime state, and TODOs
- remind pi that TODOs are never auto-started
- define how pi should refer to current lane information

#### 2. lane-todo-hygiene

Purpose:
- teach pi how to propose TODOs cleanly
- require `createdBy`, `needsReview`, and `proposalReason`
- distinguish TODOs from notes, risks, and hypotheses

#### 3. lane-status-summary

Purpose:
- standardize short summaries for runtime state and dashboard display
- keep summaries compact and useful on phone

#### 4. manager-lane-review

Purpose:
- help a future manager compare multiple lanes
- surface blockers, needs-input prompts, and stale TODO queues

### Extensions

#### 1. lane command extension

Likely commands:
- `/lane-status`
- `/lane-todos`
- `/lane-add-todo`
- `/lane-propose-todo`
- `/lane-set-current-todo`

#### 2. lane state extension

Purpose:
- update runtime state from inside pi
- expose current summary, needs-input text, and current TODO
- keep dashboard-visible state in sync

#### 3. lane dashboard bridge extension

Purpose:
- surface structured events or files that the dashboard can read
- potentially expose session control integration for live lanes

## Security and correctness notes

- Validate all lane file inputs before acting on them.
- Treat dashboard edits as external inputs.
- Refuse to operate on missing or malformed workspace paths.
- Keep business rules for TODO transitions explicit and testable.
- Separate pure state transition logic from shell interactions with files and pi session control.

## Open questions

These can wait until after V1 scaffolding:
- Should lane metadata be global, repo-local, or support both?
- Should TODOs be one file per lane or one global indexed file?
- How should runtime state be locked if multiple tools try to update it?
- Should dashboard approval of a TODO send a message into a live session automatically, or remain passive?
- How should manager state be represented once introduced?

## Recommendation

Start with:
- one lane registry file
- one TODO file per lane
- one runtime state file per lane
- `pi-lane-start` as the only required CLI entrypoint
- dashboard CRUD for TODOs and read-only lane status

Then add manager logic and richer pi extensions after the lane model proves stable.