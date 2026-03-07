---
name: lane-status-summary
description: Produce compact lane summaries suitable for dashboards and phone review. Use when summarizing lane state, reporting progress, or updating runtime summary fields.
user-invocable: true
---

# lane-status-summary

## Goal

Produce summaries that are short, concrete, and useful on a phone.

## Preferred structure

Use this order:
1. what changed
2. what is next
3. what needs input

## Rules

- Keep it brief.
- Prefer concrete nouns and verbs.
- Mention TODO ids when relevant.
- Do not restate unchanged background unless needed.
- If nothing needs input, say so plainly.

## Good example

- Changed: traced paragraph grouping on 3 tagged samples; `todo-004` looks safe to continue.
- Next: validate nested span handling on 2 malformed samples.
- Needs input: choose strict tag fidelity vs visual fallback for sample B.
