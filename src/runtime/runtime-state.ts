// pattern: Functional Core

import type {Lane, LaneRuntimeMessageBridge, LaneRuntimeMode, LaneRuntimeState, ValidationResult} from "../types.js";

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
