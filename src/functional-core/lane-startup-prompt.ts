// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export function formatLaneStartupPrompt(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState;
  readonly todoFile: LaneTodoFile;
  readonly laneContext: string | null;
  readonly needsOnboarding: boolean;
}): string {
  const {lane, runtimeState, todoFile, laneContext, needsOnboarding} = options;
  const lines = [
    `You are resuming lane ${lane.id}.`,
    `Title: ${lane.title}`,
    `Repository: ${lane.repoPath}`,
    `Session name: ${lane.sessionName}`,
    `jj bookmark: ${lane.jjBookmark ?? "(none)"}`,
    `Current mode: ${runtimeState.mode}`,
    `Current TODO: ${runtimeState.currentTodoId ?? "(none)"}`,
  ];

  const openTodos = todoFile.todos.filter(todo => todo.status === "open");
  const proposedTodos = todoFile.todos.filter(todo => todo.status === "proposed");
  lines.push(`Open TODO count: ${openTodos.length}`);
  lines.push(`Proposed TODO count: ${proposedTodos.length}`);

  if (laneContext) {
    lines.push("", "Lane context:", laneContext.trim());
  }

  if (todoFile.todos.length > 0) {
    lines.push("", "TODOs:");
    for (const todo of todoFile.todos) {
      lines.push(`- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`);
    }
  }

  if (needsOnboarding) {
    lines.push("", "This lane appears to be new and still needs onboarding.");
    lines.push("On your first turn, help the user set up this lane conversationally instead of jumping into implementation work.");
    lines.push("Use a short, focused conversation to capture:");
    lines.push("- the lane purpose and desired outcome");
    lines.push("- whether this feels like a bug, feature, investigation, cleanup, or mixed/ongoing work");
    lines.push("- any ticket, branch, PR, commit, files, directories, or commands that matter");
    lines.push("- key constraints, acceptance criteria, or references worth saving");
    lines.push("- whether you should draft a few proposed TODOs for review");
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
    lines.push("- No TODOs yet. | Draft proposed TODOs next. | Concrete next step.");
    lines.push("");
    lines.push("Keep the context compact, factual, and easy to scan later from the dashboard or a future session.");
  }

  lines.push("", "Rules:");
  lines.push("- TODOs do not auto-start.");
  lines.push("- LLM-proposed TODOs remain proposed until human review.");
  lines.push("- For lane TODOs, do not use any generic or unrelated TODO extension/tool.");
  lines.push("- To capture follow-up work, use the lane_propose_todo tool only.");
  lines.push("- To inspect current lane TODOs, use /lane-todos or the lane todo file.");
  lines.push("- Keep lane updates grounded in actual TODOs and lane files.");

  return lines.join("\n");
}
