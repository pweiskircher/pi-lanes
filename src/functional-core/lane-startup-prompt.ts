// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export function formatLaneStartupPrompt(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState;
  readonly todoFile: LaneTodoFile;
  readonly laneContext: string | null;
}): string {
  const {lane, runtimeState, todoFile, laneContext} = options;
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

  lines.push("", "Rules:");
  lines.push("- TODOs do not auto-start.");
  lines.push("- LLM-proposed TODOs remain proposed until human review.");
  lines.push("- Keep lane updates grounded in actual TODOs and lane files.");

  return lines.join("\n");
}
