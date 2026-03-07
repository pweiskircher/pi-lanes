// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export function formatLaneBriefing(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState | null;
  readonly todoFile: LaneTodoFile;
}): string {
  const {lane, runtimeState, todoFile} = options;
  const lines = [
    `Lane: ${lane.id}`,
    `Title: ${lane.title}`,
    `Repo: ${lane.repoPath}`,
    `Session: ${lane.sessionName}`,
    `Bookmark: ${lane.jjBookmark ?? "—"}`,
    `Mode: ${runtimeState?.isActive ? runtimeState.mode : "cold"}`,
    `Current TODO: ${runtimeState?.currentTodoId ?? "—"}`,
    `Open TODOs: ${todoFile.todos.filter(todo => todo.status === "open").length}`,
    `Proposed TODOs: ${todoFile.todos.filter(todo => todo.status === "proposed").length}`,
  ];

  return lines.join("\n");
}
