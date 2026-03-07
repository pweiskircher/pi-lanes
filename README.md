# pi lanes

`pi-lanes` is a lane-based workflow, CLI, and dashboard for pi.

It helps you split ongoing work into named lanes, each with its own:
- repo association
- lane context
- TODOs
- runtime state
- event history
- dashboard view

## What it does

- create and manage lanes from the CLI
- start a lane in pi with lane-aware onboarding
- keep TODOs scoped to a lane
- let LLMs propose TODOs without auto-starting them
- expose lane state to a local dashboard
- send messages into active lane sessions from the dashboard
- show recent conversation, live assistant output, and lane events

## Core ideas

- **Lane**: a named unit of work
- **Context**: the saved notes and references for that lane
- **TODOs**: lane-scoped work items
- **Proposed TODOs**: LLM-suggested TODOs that require human review
- **Runtime state**: what the lane is doing right now

## Install

### Local development

```sh
npm install
npm link
```

### Global install

```sh
npm install -g .
```

This installs:
- `pi-lane`
- `pi-lane-start`

## Quick start

Create a lane from inside a repo:

```sh
pi-lane new my-lane
```

Or point at a repo explicitly:

```sh
pi-lane new my-lane --repo /path/to/repo
```

Start the lane:

```sh
pi-lane-start my-lane
```

Continue an existing saved pi session instead of starting fresh:

```sh
pi-lane-start my-lane --continue
```

Inspect lanes:

```sh
pi-lane list
pi-lane show my-lane
```

Delete a lane:

```sh
pi-lane delete my-lane
pi-lane delete my-lane --yes
```

## Onboarding

A brand-new lane starts with a lightweight onboarding conversation.

Pi helps capture:
- what the lane is for
- the current desired outcome
- useful references, files, commands, or links
- constraints and guardrails
- whether to draft proposed TODOs

Lane TODOs do **not** auto-start.
LLM-created TODOs stay **proposed** until a human approves them.

## Dashboard

Build the dashboard:

```sh
npm run dashboard:build
```

Run the backend server:

```sh
pi-lane dashboard serve --port 4310
```

For frontend development with hot reload:

```sh
npm run dashboard:dev:full
```

Then open:
- `http://127.0.0.1:4311` for Vite dev
- `http://127.0.0.1:4310` for the built dashboard backend

## Storage

Lane data lives by default in:

```text
~/.config/pi-lanes/
```

Each lane gets its own directory:

```text
~/.config/pi-lanes/lanes/<lane-id>/
```

Important files:
- `context.md`
- `state/runtime.json`
- `state/todos.json`
- `state/events.json`

## Repo layout

- `bin/` — CLI entrypoints
- `src/` — application source
- `dashboard-app/` — dashboard frontend source
- `dashboard/` — built dashboard assets
- `extensions/` — pi extensions
- `skills/` — pi skills used by lane sessions
- `docs/` — supporting docs
- `test/` — tests

## Related docs

- `docs/pi-skills-and-extensions.md`
