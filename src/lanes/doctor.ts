// pattern: Functional Core

import type {Lane, LaneRuntimeState} from "../types.js";

export type DoctorLaneReport = {
  readonly laneId: string;
  readonly title: string;
  readonly repoExists: boolean;
  readonly runtimeFileExists: boolean;
  readonly contextFileExists: boolean;
  readonly runtimeState: LaneRuntimeState | null;
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
  readonly runtimeFileExists: boolean;
  readonly contextFileExists: boolean;
  readonly runtimeState: LaneRuntimeState | null;
}): DoctorLaneReport {
  const {lane, repoExists, runtimeFileExists, contextFileExists, runtimeState} = options;
  const issues: Array<string> = [];
  const warnings: Array<string> = [];

  if (!repoExists) {
    issues.push(`repo path missing: ${lane.repoPath}`);
  }
  if (!runtimeFileExists) {
    warnings.push("runtime file missing");
  }
  if (!contextFileExists) {
    warnings.push("lane context file missing");
  }

  return {
    laneId: lane.id,
    title: lane.title,
    repoExists,
    runtimeFileExists,
    contextFileExists,
    runtimeState,
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
