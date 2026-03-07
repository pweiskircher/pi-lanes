---
name: lane-todo-hygiene
description: Manage lane TODOs safely. Use when adding, editing, reviewing, or proposing lane TODOs, especially when pi wants to capture follow-up work without starting it.
user-invocable: true
---

# lane-todo-hygiene

## Purpose

Use this skill whenever lane TODOs are discussed or modified.

## Rules

### Required mechanism

For this lane workflow:
- do not use any generic or unrelated TODO extension/tool
- do not create TODOs in chat-only form and assume they are tracked
- use the lane-specific mechanism only:
  - `lane_propose_todo` for LLM-proposed follow-up work
  - lane CLI/dashboard commands for human TODO management

### Human-created TODOs

Human-created TODOs:
- start as `open`
- do not require review

### LLM-created TODOs

LLM-created TODOs:
- must be created as `proposed`
- must set `createdBy: "llm"`
- must set `needsReview: true`
- must include a short `proposalReason`
- must not be treated as active work until approved

## What should become a TODO

Good TODOs are:
- actionable
- scoped
- understandable without re-reading a long chat
- valuable enough to survive interruptions

Do not create TODOs for:
- vague ideas
- loose observations
- non-actionable hypotheses
- redundant restatements of the current task

## Good TODO title style

Prefer:
- `Measure lock contention in annotation traversal`
- `Compare hybrid heuristic against 5 tagged PDFs`
- `Validate paragraph grouping on malformed PDF/UA samples`

Avoid:
- `Look into issue`
- `Maybe improve paragraph logic somehow`
- `General cleanup`

## Review guidance

When reviewing a proposed TODO, help the user decide:
- does this represent real follow-up work?
- is the scope narrow enough?
- should it be approved, edited, or rejected?

## Status discipline

- Do not move a proposed LLM TODO into normal work without explicit review.
- Do not auto-mark TODOs in progress unless the user started them.
- Preserve the distinction between `proposed`, `open`, and `in_progress`.