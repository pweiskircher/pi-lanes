// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export function formatLaneStartupPrompt(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState;
  readonly todoFile: LaneTodoFile;
}): string {
  const {lane, runtimeState, todoFile} = options;
  const openTodos = todoFile.todos.filter(todo => todo.status === "open").map(todo => `- ${todo.id}: ${todo.title}`);
  const proposedTodos = todoFile.todos.filter(todo => todo.status === "proposed").map(todo => `- ${todo.id}: ${todo.title}`);

  const lines = [
    `You are working in lane ${lane.id}.`,
    `Session name should be ${lane.sessionName}.`,
    `Lane title: ${lane.title}`,
    `Workspace: ${lane.workspacePath}`,
    `JJ bookmark: ${lane.jjBookmark}`,
    `Port: ${lane.port}`,
    "Rules:",
    "- TODOs never auto-start.",
    "- LLM-created proposed TODOs require review before normal work.",
    "- Keep dashboard-visible summaries compact.",
  ];

  if (runtimeState.currentSummary) {
    lines.push(`Latest summary: ${runtimeState.currentSummary}`);
  }
  if (runtimeState.needsInput) {
    lines.push(`Needs input: ${runtimeState.needsInput}`);
  }
  if (runtimeState.currentTodoId) {
    lines.push(`Current TODO: ${runtimeState.currentTodoId}`);
  }
  if (openTodos.length > 0) {
    lines.push("Open TODOs:", ...openTodos);
  }
  if (proposedTodos.length > 0) {
    lines.push("Proposed TODOs awaiting review:", ...proposedTodos);
  }

  return lines.join("\n");
}
