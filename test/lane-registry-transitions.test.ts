import test from "node:test";
import assert from "node:assert/strict";
import {createLane} from "../src/functional-core/lane-registry-transitions.js";
import type {LaneRegistry} from "../src/types.js";

test("createLane appends a new lane", () => {
  const result = createLane([], {
    id: "mt-core",
    title: "Multithreading large subsystem",
    repoPath: "/tmp/repo",
    jjBookmark: "pat/mt-core",
    sessionName: "mt-core",
    serverCommand: "./scripts/start-dev ce",
    priority: "main",
    status: "active",
    notes: null,
    tags: ["rendering", "performance"],
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0]?.id, "mt-core");
});

test("createLane rejects duplicate ids", () => {
  const lanes: LaneRegistry = [
    {
      id: "mt-core",
      title: "Existing lane",
      repoPath: "/tmp/repo",
      jjBookmark: "pat/mt-core",
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
    repoPath: "/tmp/repo-2",
    jjBookmark: "pat/other",
    sessionName: "other",
    serverCommand: null,
    priority: "side",
    status: "active",
    notes: null,
    tags: [],
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.issues[0]?.message ?? "", /already exists/);
});
