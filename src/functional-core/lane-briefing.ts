// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export function formatLaneBriefing(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState | null;
  readonly todoFile: LaneTodoFile;
}): string {
  const {lane, runtimeState, todoFile} = options;
  const openTodos = todoFile.todos.filter(todo => todo.status === "open");
  const proposedTodos = todoFile.todos.filter(todo => todo.status === "proposed");
  const inProgressTodo = todoFile.todos.find(todo => todo.status === "in_progress");

  const lines = [
    `Lane: ${lane.id}`,
    `Title: ${lane.title}`,
    `Repo: ${lane.repoPath}`,
    `JJ bookmark: ${lane.jjBookmark ?? "—"}`,
    `Session: ${lane.sessionName}`,
    `Open TODOs: ${openTodos.length}`,
    `Proposed TODOs: ${proposedTodos.length}`,
  ];

  if (inProgressTodo) {
    lines.push(`In progress: ${inProgressTodo.id} — ${inProgressTodo.title}`);
  }

  if (runtimeState?.currentSummary) {
    lines.push(`Latest summary: ${runtimeState.currentSummary}`);
  }

  if (runtimeState?.needsInput) {
    lines.push(`Needs input: ${runtimeState.needsInput}`);
  }

  return lines.join("\n");
}
