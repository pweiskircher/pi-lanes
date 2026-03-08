---
name: lane-ci-investigation
description: Investigate CI for the current lane with a gh-first workflow. Start by checking GitHub PR/branch checks, then investigate the first actionable failure and summarize it for the human without making changes unless explicitly asked.
user-invocable: true
---

# lane-ci-investigation

## Purpose

Use this skill when the user asks pi to check CI for the current lane.

This is a **gh-first investigation workflow**:
- start with GitHub checks via `gh`
- use GitHub's view of checks even when some checks are backed by Buildkite
- if everything is green, report that and stop
- if something is failing, investigate the **first actionable failure** and summarize it for the human
- do **not** make code changes unless the human explicitly asks for that next step

## Required context

Before investigating CI:
1. Load the `lane-context` skill behavior and ground yourself in the current lane.
2. Use the `github` skill guidance for `gh` commands.
3. If GitHub check output clearly points to Buildkite and deeper Buildkite-specific inspection is needed, use the `buildkite-cli` skill as a follow-up, not as the first step.

## Guardrails

### Start with `gh`

Always start CI discovery with GitHub CLI.

Prefer this order:
1. Identify whether there is a relevant PR for the current branch or jj bookmark.
2. If there is a PR, inspect PR checks first.
3. If there is no PR, inspect recent workflow runs for the current branch.

### Jujutsu / detached-HEAD hint

In jj repos, do not assume `git branch --show-current` is enough. The working copy is often detached from Git's point of view.

Prefer this approach:
1. Check the lane metadata for `jjBookmark` first.
2. If that is missing or stale, inspect jj bookmarks near the working copy.
3. Treat the nearest relevant bookmark as the likely branch name for GitHub PR lookup.
4. Ask GitHub whether that bookmark has an open PR.

Practical guidance:
- if the lane has a `jjBookmark`, try that first
- otherwise use jj commands to identify bookmarks pointing at or near `@`
- once you have a likely bookmark name, use `gh` to find the PR for that head branch
- if multiple bookmarks or PRs are plausible, say so and ask the human rather than guessing

Useful commands include:
- `gh pr status`
- `gh pr list --head <branch> --json ...`
- `gh pr checks <pr-number> --json ...`
- `gh run list --limit 10 --json ...`
- `gh run view <run-id> --json ...`
- `gh run view <run-id> --log-failed`
- `jj bookmark list`
- `jj log -r @` or nearby revset inspection when needed

Use structured JSON output when possible.

### Bounded investigation only

Do not drift into a broad CI audit.

Default scope:
- inspect the current lane's most relevant PR or branch
- look at the latest relevant failing or pending checks first
- investigate only the **first actionable failure** unless the human asks for a broader sweep
- fetch only bounded log output, preferring failed-step logs over full logs

### No autonomous remediation

Unless the human explicitly asks for it, do **not**:
- edit files
- write code
- run mutating fix steps
- commit
- push
- retry workflows

This skill is for **investigation and summary first**.

## Investigation procedure

### 1. Confirm access and context

- Identify the repo and current branch.
- Check whether `gh` is available and authenticated enough to inspect PRs and runs.
- If GitHub access is missing or blocked, say so plainly and stop.

### 2. Find the relevant GitHub view of CI

Prefer:
- PR checks for the current branch's open PR
- otherwise recent workflow runs for the current branch

When checks include Buildkite-backed entries, treat those as part of the GitHub-level CI picture first.

### 3. Classify the top-level result

Classify the situation as one of:
- **green** — all relevant checks passed
- **failing** — at least one relevant check failed
- **pending** — checks are still queued or running
- **blocked** — auth, missing PR/run context, or ambiguous CI target

If green:
- report green and stop

If pending:
- report what is still running or queued and stop unless the human asks to keep watching

If blocked:
- explain what is missing and stop

### 4. Investigate the first actionable failure

When a failure exists:
- choose the first failure that looks actionable for a developer
- prefer test, lint, typecheck, or build failures over clearly infrastructural noise
- inspect the failed job or failed steps
- if GitHub logs are enough, stay in GitHub
- if GitHub points to Buildkite and the failure details are insufficient, then use Buildkite tooling to inspect the referenced build/job more directly

### 5. Classify the failure

Classify the investigated failure as one of:
- **code/test failure**
- **lint/typecheck/build failure**
- **likely flaky or infrastructure failure**
- **unknown**

Be explicit about uncertainty.

## Response format

Keep the response concise and decision-oriented.

Use this structure:
- **CI status:** green | failing | pending | blocked
- **What failed:** failing check/job name, provider, and link or identifier if available
- **Why it failed:** short human-readable summary of the first actionable problem
- **Confidence:** high | medium | low
- **Next step:** one recommended human-controlled next step

Example:
- CI status: failing
- What failed: `unit-tests` in GitHub Actions
- Why it failed: 3 Jest failures in `dashboard-app/src/main.tsx`; the first actionable error is a missing null check in lane snapshot rendering
- Confidence: medium
- Next step: ask me to inspect that failure in more detail or propose a fix

## Escalation to Buildkite

Only escalate to Buildkite-specific inspection when:
- GitHub checks show a Buildkite-backed failure, and
- the GitHub-level summary/logs are not enough to explain the first actionable issue

When escalating:
- prefer `bkci` structured output
- inspect only the failing build/job needed to explain the issue
- bring the result back to the same concise human-facing summary format

## Stop conditions

Stop after any of these:
- CI is green
- CI is still pending and the human did not ask for watch mode
- you found and summarized the first actionable failure
- access is blocked or the relevant CI target is ambiguous

Do not continue into remediation without explicit human direction.
