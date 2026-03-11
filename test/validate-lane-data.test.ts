import test from "node:test";
import assert from "node:assert/strict";
import {parseLaneEventLog, parseLaneRuntimeState} from "../src/shared/validate-lane-data.js";

test("parseLaneRuntimeState accepts runtime state without a current todo", () => {
  const result = parseLaneRuntimeState({
    laneId: "pi-lanes",
    isActive: true,
    startedAt: "2026-03-08T14:00:00Z",
    updatedAt: "2026-03-08T14:10:00Z",
    sessionName: "pi-lanes",
    sessionId: "abc123",
    repoPath: "/tmp/repo",
    mode: "interactive",
    messageBridge: {
      port: 45123,
      authToken: "example-token",
    },
  });

  assert.equal(result.success, true);
});

test("parseLaneEventLog accepts status events", () => {
  const result = parseLaneEventLog({
    laneId: "pi-lanes",
    events: [
      {
        timestamp: "2026-03-08T14:10:00Z",
        kind: "status",
        summary: "Lane summary updated",
        details: null,
      },
    ],
  });

  assert.equal(result.success, true);
});

test("parseLaneRuntimeState rejects invalid modes", () => {
  const result = parseLaneRuntimeState({
    laneId: "pi-lanes",
    isActive: true,
    updatedAt: "2026-03-08T14:10:00Z",
    sessionName: "pi-lanes",
    repoPath: "/tmp/repo",
    mode: "flying",
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.issues[0]?.message ?? "", /expected one of/);
});
