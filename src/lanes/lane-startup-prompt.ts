// pattern: Functional Core

import type {Lane, LaneRuntimeState} from "../types.js";

export function formatLaneStartupPrompt(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState;
  readonly laneContext: string | null;
  readonly needsOnboarding: boolean;
}): string {
  const {lane, runtimeState, laneContext, needsOnboarding} = options;
  const lines = [
    `You are resuming lane ${lane.id}.`,
    `Title: ${lane.title}`,
    `Repository: ${lane.repoPath}`,
    `Session name: ${lane.sessionName}`,
    `jj bookmark: ${lane.jjBookmark ?? "(none)"}`,
    `Current mode: ${runtimeState.mode}`,
  ];

  if (laneContext) {
    lines.push("", "Lane context:", laneContext.trim());
  }

  if (needsOnboarding) {
    lines.push("", "This lane appears to be new and still needs onboarding.");
    lines.push("On your first turn, help the user set up this lane conversationally instead of jumping into implementation work.");
    lines.push("Use a short, focused conversation to capture:");
    lines.push("- the lane purpose and desired outcome");
    lines.push("- whether this feels like a bug, feature, investigation, cleanup, or mixed/ongoing work");
    lines.push("- any ticket, branch, PR, commit, files, directories, or commands that matter");
    lines.push("- key constraints, acceptance criteria, or references worth saving");
    lines.push("- the next concrete step or decision to capture in the lane context");
    lines.push("If useful, inspect the repo and recent history to help the user ground the lane context.");
    lines.push("After the conversation, update the lane context with the agreed facts using exactly this compact shape:");
    lines.push("# <lane-id>");
    lines.push("");
    lines.push("Purpose:");
    lines.push("- What this lane is for");
    lines.push("- Current desired outcome");
    lines.push("");
    lines.push("Classification:");
    lines.push("- feature | bug | investigation | cleanup | mixed/ongoing");
    lines.push("");
    lines.push("Current status:");
    lines.push("- setup only for now | active task | blocked | other");
    lines.push("");
    lines.push("Constraints:");
    lines.push("- Important guardrails or limits");
    lines.push("");
    lines.push("References:");
    lines.push("- Repo: ...");
    lines.push("- Ticket/issue: ...");
    lines.push("- Branch/PR/commit: ...");
    lines.push("- Key files/dirs: ...");
    lines.push("- Useful commands/docs: ...");
    lines.push("");
    lines.push("Next:");
    lines.push("- Concrete next step or decision.");
    lines.push("");
    lines.push("Keep the context compact, factual, and easy to scan later from the dashboard or a future session.");
  }

  lines.push("", "Rules:");
  lines.push("- Treat the lane context and runtime files as the source of truth.");
  lines.push("- Keep lane updates compact, factual, and grounded in the repository.");
  lines.push("- Do not silently edit lane metadata unless the user asked for it.");

  return lines.join("\n");
}
