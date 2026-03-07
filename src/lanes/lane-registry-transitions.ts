// pattern: Functional Core

import type {Lane, LanePriority, LaneRegistry, LaneStatus, ValidationResult} from "../types.js";

export type CreateLaneOptions = {
  readonly id: string;
  readonly title: string;
  readonly repoPath: string;
  readonly jjBookmark: string | null;
  readonly sessionName: string;
  readonly serverCommand: string | null;
  readonly priority: LanePriority | null;
  readonly status: LaneStatus | null;
  readonly notes: string | null;
  readonly tags: ReadonlyArray<string>;
};

const laneIdPattern = /^[a-z0-9][a-z0-9-]*$/;

export function createLane(lanes: LaneRegistry, options: CreateLaneOptions): ValidationResult<LaneRegistry> {
  if (!laneIdPattern.test(options.id)) {
    return invalid("lane id must match ^[a-z0-9][a-z0-9-]*$");
  }
  if (lanes.some(lane => lane.id === options.id)) {
    return invalid(`lane id already exists: ${options.id}`);
  }
  if (lanes.some(lane => lane.sessionName === options.sessionName)) {
    return invalid(`lane session name already exists: ${options.sessionName}`);
  }
  if (options.title.trim().length === 0) {
    return invalid("lane title cannot be empty");
  }
  if (options.repoPath.trim().length === 0) {
    return invalid("repo path cannot be empty");
  }
  if (options.sessionName.trim().length === 0) {
    return invalid("session name cannot be empty");
  }

  const lane: Lane = {
    id: options.id,
    title: options.title,
    repoPath: options.repoPath,
    jjBookmark: normalizeNullableText(options.jjBookmark),
    sessionName: options.sessionName,
    serverCommand: normalizeNullableText(options.serverCommand),
    priority: options.priority,
    status: options.status,
    notes: normalizeNullableText(options.notes),
    tags: normalizeTags(options.tags),
  };

  return {
    success: true,
    data: [...lanes, lane],
  };
}

function normalizeTags(tags: ReadonlyArray<string>): ReadonlyArray<string> {
  return tags.map(tag => tag.trim()).filter(tag => tag.length > 0);
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function invalid(message: string): ValidationResult<never> {
  return {success: false, issues: [{path: "$", message}]};
}
