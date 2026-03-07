import assert from "node:assert/strict";
import test from "node:test";
import {findLaneControlledSessionInSessions, type PiControlledSession} from "../src/pi/pi-session-control.js";
import type {Lane} from "../src/types.js";

function createLane(overrides?: Partial<Lane>): Lane {
  return {
    id: "lane-a",
    title: "Lane A",
    repoPath: "/repo/a",
    jjBookmark: null,
    sessionName: "lane-a",
    serverCommand: null,
    priority: null,
    status: "active",
    notes: null,
    tags: [],
    ...overrides,
  };
}

function createSession(overrides?: Partial<PiControlledSession>): PiControlledSession {
  return {
    sessionId: "session-1",
    name: "lane-a",
    aliases: [],
    cwd: "/repo/a",
    isIdle: true,
    lastUser: null,
    lastAssistant: null,
    recentMessages: [],
    ...overrides,
  };
}

test("findLaneControlledSessionInSessions prefers a unique session-name match", async () => {
  const lane = createLane({sessionName: "focus-lane", repoPath: "/repo/target"});
  const sessions = [
    createSession({sessionId: "other", name: "other-lane", cwd: "/repo/target"}),
    createSession({sessionId: "target", name: "focus-lane", cwd: "/repo/elsewhere"}),
  ];

  const result = await findLaneControlledSessionInSessions(lane, sessions);

  assert.equal(result?.sessionId, "target");
});

test("findLaneControlledSessionInSessions falls back to a unique cwd match", async () => {
  const lane = createLane({sessionName: "focus-lane", repoPath: "/repo/target"});
  const sessions = [
    createSession({sessionId: "other", name: "other-lane", cwd: "/repo/other"}),
    createSession({sessionId: "target", name: "different-name", cwd: "/repo/target"}),
  ];

  const result = await findLaneControlledSessionInSessions(lane, sessions);

  assert.equal(result?.sessionId, "target");
});
