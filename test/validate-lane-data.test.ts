import test from "node:test";
import assert from "node:assert/strict";
import {parseLaneTodoFile} from "../src/shared/validate-lane-data.js";

test("parseLaneTodoFile accepts approved llm-created todos", () => {
  const result = parseLaneTodoFile({
    laneId: "pi-lanes",
    todos: [
      {
        id: "todo-001",
        title: "Investigate CI flow",
        notes: null,
        status: "open",
        priority: "high",
        createdBy: "llm",
        needsReview: false,
        proposalReason: "Useful follow-up work.",
        createdAt: "2026-03-08T14:00:00Z",
        updatedAt: "2026-03-08T14:10:00Z",
      },
    ],
  });

  assert.equal(result.success, true);
});

test("parseLaneTodoFile rejects proposed llm todos that no longer require review", () => {
  const result = parseLaneTodoFile({
    laneId: "pi-lanes",
    todos: [
      {
        id: "todo-001",
        title: "Investigate CI flow",
        notes: null,
        status: "proposed",
        priority: "high",
        createdBy: "llm",
        needsReview: false,
        proposalReason: "Useful follow-up work.",
        createdAt: "2026-03-08T14:00:00Z",
        updatedAt: "2026-03-08T14:10:00Z",
      },
    ],
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.issues[0]?.message ?? "", /must require review/);
});

test("parseLaneTodoFile rejects reviewed llm todos that still require review", () => {
  const result = parseLaneTodoFile({
    laneId: "pi-lanes",
    todos: [
      {
        id: "todo-001",
        title: "Investigate CI flow",
        notes: null,
        status: "open",
        priority: "high",
        createdBy: "llm",
        needsReview: true,
        proposalReason: "Useful follow-up work.",
        createdAt: "2026-03-08T14:00:00Z",
        updatedAt: "2026-03-08T14:10:00Z",
      },
    ],
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.issues[0]?.message ?? "", /cannot still require review/);
});
