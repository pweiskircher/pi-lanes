// pattern: Functional Core

import type {Lane, LaneRuntimeState, LaneTodoFile} from "../types.js";

export type DoctorLaneReport = {
  readonly laneId: string;
  readonly title: string;
  readonly workspaceExists: boolean;
  readonly repoExists: boolean;
  readonly todoFileExists: boolean;
  readonly runtimeFileExists: boolean;
  readonly runtimeState: LaneRuntimeState | null;
  readonly openTodoCount: number;
  readonly proposedTodoCount: number;
  readonly inProgressTodoCount: number;
  readonly currentTodoIsValid: boolean;
  readonly currentTodoMessage: string | null;
  readonly portStatus: "unknown" | "free" | "in_use";
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
  readonly workspaceExists: boolean;
  readonly repoExists: boolean;
  readonly todoFileExists: boolean;
  readonly runtimeFileExists: boolean;
  readonly todoFile: LaneTodoFile;
  readonly runtimeState: LaneRuntimeState | null;
  readonly portStatus: "unknown" | "free" | "in_use";
}): DoctorLaneReport {
  const {lane, workspaceExists, repoExists, todoFileExists, runtimeFileExists, todoFile, runtimeState, portStatus} = options;
  const issues: Array<string> = [];
  const warnings: Array<string> = [];

  if (!workspaceExists) {
    issues.push(`workspace path missing: ${lane.workspacePath}`);
  }
  if (!repoExists) {
    issues.push(`repo path missing: ${lane.repoPath}`);
  }
  if (!todoFileExists) {
    warnings.push("todo file missing");
  }
  if (!runtimeFileExists) {
    warnings.push("runtime file missing");
  }

  const currentTodoMessage = getCurrentTodoMessage(runtimeState, todoFile);
  const currentTodoIsValid = currentTodoMessage === null;
  if (currentTodoMessage !== null) {
    warnings.push(currentTodoMessage);
  }

  if (portStatus === "in_use" && runtimeState?.isActive !== true) {
    warnings.push(`port ${lane.port} is already in use while lane is not marked active`);
  }

  return {
    laneId: lane.id,
    title: lane.title,
    workspaceExists,
    repoExists,
    todoFileExists,
    runtimeFileExists,
    runtimeState,
    openTodoCount: todoFile.todos.filter(todo => todo.status === "open").length,
    proposedTodoCount: todoFile.todos.filter(todo => todo.status === "proposed").length,
    inProgressTodoCount: todoFile.todos.filter(todo => todo.status === "in_progress").length,
    currentTodoIsValid,
    currentTodoMessage,
    portStatus,
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
