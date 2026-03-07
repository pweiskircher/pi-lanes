import test from "node:test";
import assert from "node:assert/strict";
import {createLane} from "../src/functional-core/lane-registry-transitions.js";
import type {LaneRegistry} from "../src/types.js";

test("createLane appends a new lane", () => {
  const result = createLane([], {
    id: "mt-core",
    title: "Multithreading large subsystem",
    workspacePath: "/tmp/mt-core",
    repoPath: "/tmp/repo",
    jjBookmark: "pat/mt-core",
    port: 3001,
    sessionName: "mt-core",
    serverCommand: "pnpm dev --port 3001",
    priority: "main",
    status: "active",
    notes: null,
    tags: ["rendering", "performance"],
  });

  assert.equal(result.success, true);
  if (!result.success) {
    return;
  }

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.id, "mt-core");
});

test("createLane rejects duplicate ids", () => {
  const lanes: LaneRegistry = [
    {
      id: "mt-core",
      title: "Existing lane",
      workspacePath: "/tmp/mt-core",
      repoPath: "/tmp/repo",
      jjBookmark: "pat/mt-core",
      port: 3001,
      sessionName: "mt-core",
      serverCommand: null,
      priority: "main",
      status: "active",
      notes: null,
      tags: [],
    },
  ];

  const result = createLane(lanes, {
    id: "mt-core",
    title: "Duplicate lane",
    workspacePath: "/tmp/other",
    repoPath: "/tmp/repo",
    jjBookmark: "pat/other",
    port: 3002,
    sessionName: "other",
    serverCommand: null,
    priority: "side",
    status: "active",
    notes: null,
    tags: [],
  });

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  assert.match(result.issues[0]?.message ?? "", /already exists/);
});
