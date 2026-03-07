// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export type DoctorLaneReport = {
  readonly laneId: string;
  readonly title: string;
  readonly repoExists: boolean;
  readonly todoFileExists: boolean;
  readonly runtimeFileExists: boolean;
  readonly contextFileExists: boolean;
  readonly runtimeState: LaneRuntimeState | null;
  readonly openTodoCount: number;
  readonly proposedTodoCount: number;
  readonly inProgressTodoCount: number;
  readonly currentTodoIsValid: boolean;
  readonly currentTodoMessage: string | null;
  readonly issues: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly piAvailable: boolean;
  readonly laneCount: number;
  readonly issues: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly lanes: ReadonlyArray<DoctorLaneReport>;
};

export function buildDoctorLaneReport(options: {
  readonly lane: Lane;
  readonly repoExists: boolean;
  readonly todoFileExists: boolean;
  readonly runtimeFileExists: boolean;
  readonly contextFileExists: boolean;
  readonly todoFile: LaneTodoFile;
  readonly runtimeState: LaneRuntimeState | null;
}): DoctorLaneReport {
  const {lane, repoExists, todoFileExists, runtimeFileExists, contextFileExists, todoFile, runtimeState} = options;
  const issues: Array<string> = [];
  const warnings: Array<string> = [];

  if (!repoExists) {
    issues.push(`repo path missing: ${lane.repoPath}`);
  }
  if (!todoFileExists) {
    warnings.push("todo file missing");
  }
  if (!runtimeFileExists) {
    warnings.push("runtime file missing");
  }
  if (!contextFileExists) {
    warnings.push("lane context file missing");
  }

  const currentTodoMessage = getCurrentTodoMessage(runtimeState, todoFile);
  const currentTodoIsValid = currentTodoMessage === null;
  if (currentTodoMessage !== null) {
    warnings.push(currentTodoMessage);
  }

  return {
    laneId: lane.id,
    title: lane.title,
    repoExists,
    todoFileExists,
    runtimeFileExists,
    contextFileExists,
    runtimeState,
    openTodoCount: todoFile.todos.filter(todo => todo.status === "open").length,
    proposedTodoCount: todoFile.todos.filter(todo => todo.status === "proposed").length,
    inProgressTodoCount: todoFile.todos.filter(todo => todo.status === "in_progress").length,
    currentTodoIsValid,
    currentTodoMessage,
    issues,
    warnings,
  };
}

export function buildDoctorReport(options: {
  readonly piAvailable: boolean;
  readonly lanes: ReadonlyArray<DoctorLaneReport>;
}): DoctorReport {
  const {piAvailable, lanes} = options;
  const issues: Array<string> = [];
  const warnings: Array<string> = [];

  if (!piAvailable) {
    issues.push("pi executable not found on PATH");
  }
  if (lanes.length === 0) {
    warnings.push("no lanes configured");
  }

  for (const lane of lanes) {
    issues.push(...lane.issues.map(issue => `${lane.laneId}: ${issue}`));
    warnings.push(...lane.warnings.map(warning => `${lane.laneId}: ${warning}`));
  }

  return {
    ok: issues.length === 0,
    piAvailable,
    laneCount: lanes.length,
    issues,
    warnings,
    lanes,
  };
}

function getCurrentTodoMessage(runtimeState: LaneRuntimeState | null, todoFile: LaneTodoFile): string | null {
  const currentTodoId = runtimeState?.currentTodoId ?? null;
  if (currentTodoId === null) {
    return null;
  }

  const todo = todoFile.todos.find(candidate => candidate.id === currentTodoId);
  if (!todo) {
    return `current todo does not exist: ${currentTodoId}`;
  }
  if (todo.status === "proposed") {
    return `current todo points at unreviewed proposal: ${currentTodoId}`;
  }
  return null;
}
