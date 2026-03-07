import test from "node:test";
import assert from "node:assert/strict";
import {
  createStartedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimeLastHumanInstruction,
  setRuntimeMode,
  setRuntimeNeedsInput,
  setRuntimeSummary,
} from "../src/functional-core/runtime-state.js";
import type {Lane, LaneRuntimeState, LaneTodoFile} from "../src/types.js";

test("setRuntimeSummary updates the summary and timestamp", () => {
  const state = createRuntimeState();
  const result = setRuntimeSummary(state, "Finished first pass", "2026-03-07T14:10:00Z");
  assert.equal(result.currentSummary, "Finished first pass");
  assert.equal(result.updatedAt, "2026-03-07T14:10:00Z");
});

test("setRuntimeNeedsInput trims empty text to null", () => {
  const state = createRuntimeState();
  const result = setRuntimeNeedsInput(state, "   ", "2026-03-07T14:10:00Z");
  assert.equal(result.needsInput, null);
});

test("setRuntimeCurrentTodo accepts a reviewed todo", () => {
  const state = createRuntimeState();
  const todoFile: LaneTodoFile = {
    laneId: "mt-core",
    todos: [{ id: "todo-001", title: "Measure contention", notes: null, status: "open", priority: "high", createdBy: "human", needsReview: false, proposalReason: null, createdAt: "2026-03-07T14:00:00Z", updatedAt: "2026-03-07T14:00:00Z" }],
  };
  const result = setRuntimeCurrentTodo(state, todoFile, "todo-001", "2026-03-07T14:10:00Z");
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.currentTodoId, "todo-001");
});

test("setRuntimeCurrentTodo rejects an unreviewed proposal", () => {
  const state = createRuntimeState();
  const todoFile: LaneTodoFile = {
    laneId: "mt-core",
    todos: [{ id: "todo-002", title: "Suggested follow-up", notes: null, status: "proposed", priority: "medium", createdBy: "llm", needsReview: true, proposalReason: "Potential next step.", createdAt: "2026-03-07T14:00:00Z", updatedAt: "2026-03-07T14:00:00Z" }],
  };
  const result = setRuntimeCurrentTodo(state, todoFile, "todo-002", "2026-03-07T14:10:00Z");
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.issues[0]?.message ?? "", /unreviewed proposal/);
});

test("setRuntimeMode validates allowed modes", () => {
  const state = createRuntimeState();
  const result = setRuntimeMode(state, "working", "2026-03-07T14:10:00Z");
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.mode, "working");
});

test("setRuntimeLastHumanInstruction clears blank instructions", () => {
  const state = createRuntimeState();
  const result = setRuntimeLastHumanInstruction(state, "", "2026-03-07T14:10:00Z");
  assert.equal(result.lastHumanInstruction, null);
});

function createRuntimeState(): LaneRuntimeState {
  return createStartedRuntimeState({ lane: createLane(), existingRuntimeState: null, now: "2026-03-07T14:00:00Z" });
}

function createLane(): Lane {
  return {
    id: "mt-core",
    title: "Multithreading large subsystem",
    repoPath: "/tmp/repo",
    jjBookmark: "pat/mt-core",
    sessionName: "mt-core",
    serverCommand: null,
    priority: "main",
    status: "active",
    notes: null,
    tags: [],
  };
}
