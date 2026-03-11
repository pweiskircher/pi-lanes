import test from "node:test";
import assert from "node:assert/strict";
import {
  createStartedRuntimeState,
  setRuntimeMode,
} from "../src/runtime/runtime-state.js";
import type {Lane, LaneRuntimeState} from "../src/types.js";

test("createStartedRuntimeState initializes a new interactive runtime state", () => {
  const state = createRuntimeState();
  assert.equal(state.mode, "interactive");
  assert.equal(state.messageBridge, null);
  assert.equal(state.sessionName, "mt-core");
});

test("setRuntimeMode validates allowed modes", () => {
  const state = createRuntimeState();
  const result = setRuntimeMode(state, "working", "2026-03-07T14:10:00Z");
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.mode, "working");
});

function createRuntimeState(): LaneRuntimeState {
  return createStartedRuntimeState({lane: createLane(), existingRuntimeState: null, now: "2026-03-07T14:00:00Z"});
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
