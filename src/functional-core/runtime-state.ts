// pattern: Functional Core

import type {Lane, LaneRuntimeState} from "../types.js";

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
    workspacePath: lane.workspacePath,
    port: lane.port,
    mode: "interactive",
    currentTodoId: existingRuntimeState?.currentTodoId ?? null,
    currentSummary: existingRuntimeState?.currentSummary ?? null,
    pendingQuestion: existingRuntimeState?.pendingQuestion ?? null,
    lastHumanInstruction: existingRuntimeState?.lastHumanInstruction ?? null,
  };
}

export function createStoppedRuntimeState(runtimeState: LaneRuntimeState, now: string): LaneRuntimeState {
  return {
    ...runtimeState,
    isActive: false,
    updatedAt: now,
    mode: "stopped",
  };
}
