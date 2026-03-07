import test from "node:test";
import assert from "node:assert/strict";
import {formatInitialLaneContext, needsLaneOnboarding} from "../src/lanes/lane-context.js";
import type {Lane} from "../src/types.js";

const lane: Lane = {
  id: "pdfua-ce",
  title: "pdfua-ce",
  repoPath: "/tmp/repo",
  jjBookmark: null,
  sessionName: "pdfua-ce",
  serverCommand: null,
  priority: null,
  status: "active",
  notes: null,
  tags: [],
};

test("needsLaneOnboarding returns true for the initial template", () => {
  assert.equal(needsLaneOnboarding({lane, laneContext: formatInitialLaneContext(lane)}), true);
});

test("formatInitialLaneContext includes the onboarding target sections", () => {
  const context = formatInitialLaneContext(lane);
  assert.match(context, /Classification:/);
  assert.match(context, /Current status:/);
  assert.match(context, /Next:/);
  assert.match(context, /Useful commands\/docs:/);
});

test("needsLaneOnboarding returns false for a customized context", () => {
  const customizedContext = `# ${lane.id}\n\nPurpose:\n- Fix a PDF\/UA bug in the content editor.\n- Prepare the next implementation step.\n\nClassification:\n- investigation\n\nCurrent status:\n- setup only for now\n\nConstraints:\n- Do not start work automatically.\n\nReferences:\n- Repo: /tmp/repo\n- Ticket/issue: ABC-123\n- Branch/PR/commit: none yet\n- Key files/dirs: src/, test/\n- Useful commands/docs: npm test\n\nNext:\n- No TODOs yet.\n`;
  assert.equal(needsLaneOnboarding({lane, laneContext: customizedContext}), false);
});
