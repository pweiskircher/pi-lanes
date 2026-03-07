// pattern: Functional Core

import type {Lane, LaneRuntimeMessageBridge, LaneRuntimeMode, LaneRuntimeState, LaneTodoFile, ValidationResult} from "../types.js";

const runtimeModes = new Set<LaneRuntimeMode>(["idle", "interactive", "working", "waiting_for_input", "blocked", "stopped"]);

export function createStartedRuntimeState(options: {
  readonly lane: Lane;
  readonly existingRuntimeState: LaneRuntimeState | null;
  readonly now: string;
}): LaneRuntimeState {
  const {lane, existingRuntimeState, now} = options;

  return {
    laneId: lane.id,
    isActive: true,
    startedAt: existingRuntimeState?.startedAt ?? now,
    updatedAt: now,
    sessionName: lane.sessionName,
    sessionId: existingRuntimeState?.sessionId ?? null,
    repoPath: lane.repoPath,
    mode: "interactive",
    currentTodoId: existingRuntimeState?.currentTodoId ?? null,
    messageBridge: existingRuntimeState?.messageBridge ?? null,
  };
}

export function createStoppedRuntimeState(runtimeState: LaneRuntimeState, now: string): LaneRuntimeState {
  return {
    ...runtimeState,
    isActive: false,
    updatedAt: now,
    mode: "stopped",
    messageBridge: null,
  };
}

export function setRuntimeCurrentTodo(
  runtimeState: LaneRuntimeState,
  todoFile: LaneTodoFile,
  todoId: string | null,
  now: string,
): ValidationResult<LaneRuntimeState> {
  if (todoId === null) {
    return {
      success: true,
      data: {
        ...runtimeState,
        updatedAt: now,
        currentTodoId: null,
      },
    };
  }

  const todo = todoFile.todos.find(candidate => candidate.id === todoId);
  if (!todo) {
    return {
      success: false,
      issues: [{path: "currentTodoId", message: `todo not found: ${todoId}`}],
    };
  }

  if (todo.status === "proposed") {
    return {
      success: false,
      issues: [{path: "currentTodoId", message: `cannot set current todo to unreviewed proposal: ${todoId}`}],
    };
  }

  return {
    success: true,
    data: {
      ...runtimeState,
      updatedAt: now,
      currentTodoId: todoId,
    },
  };
}

export function setRuntimeMode(
  runtimeState: LaneRuntimeState,
  mode: string,
  now: string,
): ValidationResult<LaneRuntimeState> {
  if (!runtimeModes.has(mode as LaneRuntimeMode)) {
    return {
      success: false,
      issues: [{path: "mode", message: `invalid runtime mode: ${mode}`}],
    };
  }

  return {
    success: true,
    data: {
      ...runtimeState,
      updatedAt: now,
      mode: mode as LaneRuntimeMode,
    },
  };
}

export function setRuntimeMessageBridge(
  runtimeState: LaneRuntimeState,
  messageBridge: LaneRuntimeMessageBridge | null,
  now: string,
): LaneRuntimeState {
  return {
    ...runtimeState,
    updatedAt: now,
    messageBridge,
  };
}
