// pattern: Functional Core

import type {
  Lane,
  LaneRegistry,
  LaneEvent,
  LaneEventKind,
  LaneEventLog,
  LaneRuntimeMode,
  LaneRuntimeState,
  LaneStatus,
  LaneTodo,
  LaneTodoFile,
  LanePriority,
  TodoCreatedBy,
  TodoPriority,
  TodoStatus,
  ValidationIssue,
  ValidationResult,
} from "../types.js";

const LANE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TODO_ID_PATTERN = /^todo-[a-z0-9]+$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const lanePriorities = new Set<LanePriority>(["main", "side", "parked"]);
const laneStatuses = new Set<LaneStatus>(["active", "paused", "archived"]);
const todoStatuses = new Set<TodoStatus>(["proposed", "open", "in_progress", "blocked", "done", "dropped"]);
const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);
const todoCreators = new Set<TodoCreatedBy>(["human", "llm"]);
const runtimeModes = new Set<LaneRuntimeMode>(["idle", "interactive", "working", "waiting_for_input", "blocked", "stopped"]);
const laneEventKinds = new Set<LaneEventKind>(["session_start", "session_shutdown", "agent_start", "agent_end", "turn_end", "input", "dashboard_message", "todo_proposed"]);

export function parseLaneRegistry(input: unknown): ValidationResult<LaneRegistry> {
  if (!Array.isArray(input)) {
    return failure([{path: "$", message: "expected an array of lanes"}]);
  }

  const issues: Array<ValidationIssue> = [];
  const lanes = input.map((value, index) => parseLane(value, `$[${index}]`, issues));

  const laneIds = new Set<string>();
  for (const lane of lanes) {
    if (!lane) continue;
    if (laneIds.has(lane.id)) {
      issues.push({path: `$[id=${lane.id}]`, message: "lane id must be unique"});
      continue;
    }
    laneIds.add(lane.id);
  }

  if (issues.length > 0) {
    return failure(issues);
  }

  return {success: true, data: lanes.filter(isDefined)};
}

export function parseLaneTodoFile(input: unknown): ValidationResult<LaneTodoFile> {
  const issues: Array<ValidationIssue> = [];
  const objectValue = readObject(input, "$", issues);
  if (!objectValue) {
    return failure(issues);
  }

  const laneId = readLaneId(objectValue.laneId, "$.laneId", issues);
  const todosValue = objectValue.todos;
  if (!Array.isArray(todosValue)) {
    issues.push({path: "$.todos", message: "expected an array"});
  }

  const todos = Array.isArray(todosValue)
    ? todosValue.map((value, index) => parseLaneTodo(value, `$.todos[${index}]`, issues)).filter(isDefined)
    : [];

  const todoIds = new Set<string>();
  for (const todo of todos) {
    if (todoIds.has(todo.id)) {
      issues.push({path: `$.todos[id=${todo.id}]`, message: "todo id must be unique within a lane"});
      continue;
    }
    todoIds.add(todo.id);
  }

  if (issues.length > 0 || laneId === null) {
    return failure(issues);
  }

  return {success: true, data: {laneId, todos}};
}

export function parseLaneRuntimeState(input: unknown): ValidationResult<LaneRuntimeState> {
  const issues: Array<ValidationIssue> = [];
  const objectValue = readObject(input, "$", issues);
  if (!objectValue) {
    return failure(issues);
  }

  const laneId = readLaneId(objectValue.laneId, "$.laneId", issues);
  const isActive = readBoolean(objectValue.isActive, "$.isActive", issues);
  const startedAt = readOptionalIsoDate(objectValue.startedAt, "$.startedAt", issues);
  const updatedAt = readRequiredIsoDate(objectValue.updatedAt, "$.updatedAt", issues);
  const sessionName = readNonEmptyString(objectValue.sessionName, "$.sessionName", issues);
  const sessionId = readOptionalString(objectValue.sessionId, "$.sessionId", issues);
  const repoPath = readNonEmptyString(objectValue.repoPath, "$.repoPath", issues);
  const mode = readEnum(objectValue.mode, "$.mode", runtimeModes, issues);
  const currentTodoId = readOptionalTodoId(objectValue.currentTodoId, "$.currentTodoId", issues);
  const messageBridge = readOptionalMessageBridge(objectValue.messageBridge, "$.messageBridge", issues);

  if (issues.length > 0 || laneId === null || isActive === null || updatedAt === null || sessionName === null || repoPath === null || mode === null) {
    return failure(issues);
  }

  return {
    success: true,
    data: {
      laneId,
      isActive,
      startedAt,
      updatedAt,
      sessionName,
      sessionId,
      repoPath,
      mode,
      currentTodoId,
      messageBridge,
    },
  };
}

export function parseLaneEventLog(input: unknown): ValidationResult<LaneEventLog> {
  const issues: Array<ValidationIssue> = [];
  const objectValue = readObject(input, "$", issues);
  if (!objectValue) {
    return failure(issues);
  }

  const laneId = readLaneId(objectValue.laneId, "$.laneId", issues);
  const eventsValue = objectValue.events;
  if (!Array.isArray(eventsValue)) {
    issues.push({path: "$.events", message: "expected an array"});
  }

  const events = Array.isArray(eventsValue)
    ? eventsValue.map((value, index) => parseLaneEvent(value, `$.events[${index}]`, issues)).filter(isDefined)
    : [];

  if (issues.length > 0 || laneId === null) {
    return failure(issues);
  }

  return {success: true, data: {laneId, events}};
}

function parseLane(input: unknown, path: string, issues: Array<ValidationIssue>): Lane | null {
  const objectValue = readObject(input, path, issues);
  if (!objectValue) {
    return null;
  }

  const id = readLaneId(objectValue.id, `${path}.id`, issues);
  const title = readNonEmptyString(objectValue.title, `${path}.title`, issues);
  const repoPath = readNonEmptyString(objectValue.repoPath, `${path}.repoPath`, issues);
  const jjBookmark = readOptionalString(objectValue.jjBookmark, `${path}.jjBookmark`, issues);
  const sessionName = readNonEmptyString(objectValue.sessionName, `${path}.sessionName`, issues);
  const serverCommand = readOptionalString(objectValue.serverCommand, `${path}.serverCommand`, issues);
  const priority = readOptionalEnum(objectValue.priority, `${path}.priority`, lanePriorities, issues);
  const status = readOptionalEnum(objectValue.status, `${path}.status`, laneStatuses, issues);
  const notes = readOptionalString(objectValue.notes, `${path}.notes`, issues);
  const tags = readOptionalStringArray(objectValue.tags, `${path}.tags`, issues);

  if (id === null || title === null || repoPath === null || sessionName === null || tags === null) {
    return null;
  }

  return {
    id,
    title,
    repoPath,
    jjBookmark,
    sessionName,
    serverCommand,
    priority,
    status,
    notes,
    tags,
  };
}

function parseLaneEvent(input: unknown, path: string, issues: Array<ValidationIssue>): LaneEvent | null {
  const objectValue = readObject(input, path, issues);
  if (!objectValue) {
    return null;
  }

  const timestamp = readRequiredIsoDate(objectValue.timestamp, `${path}.timestamp`, issues);
  const kind = readEnum(objectValue.kind, `${path}.kind`, laneEventKinds, issues);
  const summary = readNonEmptyString(objectValue.summary, `${path}.summary`, issues);
  const details = readOptionalString(objectValue.details, `${path}.details`, issues);

  if (timestamp === null || kind === null || summary === null) {
    return null;
  }

  return {timestamp, kind, summary, details};
}

function parseLaneTodo(input: unknown, path: string, issues: Array<ValidationIssue>): LaneTodo | null {
  const objectValue = readObject(input, path, issues);
  if (!objectValue) {
    return null;
  }

  const id = readTodoId(objectValue.id, `${path}.id`, issues);
  const title = readNonEmptyString(objectValue.title, `${path}.title`, issues);
  const notes = readOptionalString(objectValue.notes, `${path}.notes`, issues);
  const status = readEnum(objectValue.status, `${path}.status`, todoStatuses, issues);
  const priority = readEnum(objectValue.priority, `${path}.priority`, todoPriorities, issues);
  const createdBy = readEnum(objectValue.createdBy, `${path}.createdBy`, todoCreators, issues);
  const needsReview = readBoolean(objectValue.needsReview, `${path}.needsReview`, issues);
  const proposalReason = readOptionalString(objectValue.proposalReason, `${path}.proposalReason`, issues);
  const createdAt = readRequiredIsoDate(objectValue.createdAt, `${path}.createdAt`, issues);
  const updatedAt = readRequiredIsoDate(objectValue.updatedAt, `${path}.updatedAt`, issues);

  if (createdBy === "llm") {
    if (status !== "proposed") issues.push({path: `${path}.status`, message: 'llm-created todos must start as "proposed"'});
    if (needsReview !== true) issues.push({path: `${path}.needsReview`, message: "llm-created todos must require review"});
    if (!proposalReason) issues.push({path: `${path}.proposalReason`, message: "llm-created todos must include a proposal reason"});
  }

  if (createdBy === "human" && needsReview === true) {
    issues.push({path: `${path}.needsReview`, message: "human-created todos cannot require review in V1"});
  }

  if (id === null || title === null || status === null || priority === null || createdBy === null || needsReview === null || createdAt === null || updatedAt === null) {
    return null;
  }

  return {id, title, notes, status, priority, createdBy, needsReview, proposalReason, createdAt, updatedAt};
}

function readObject(input: unknown, path: string, issues: Array<ValidationIssue>): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    issues.push({path, message: "expected an object"});
    return null;
  }
  return input as Record<string, unknown>;
}

function readLaneId(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  const value = readNonEmptyString(input, path, issues);
  if (value === null) return null;
  if (!LANE_ID_PATTERN.test(value)) {
    issues.push({path, message: "expected a lowercase lane id such as mt-core"});
    return null;
  }
  return value;
}

function readTodoId(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  const value = readNonEmptyString(input, path, issues);
  if (value === null) return null;
  if (!TODO_ID_PATTERN.test(value)) {
    issues.push({path, message: "expected a todo id such as todo-001"});
    return null;
  }
  return value;
}

function readOptionalTodoId(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  if (input === undefined || input === null) return null;
  return readTodoId(input, path, issues);
}

function readNonEmptyString(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  if (typeof input !== "string" || input.trim().length === 0) {
    issues.push({path, message: "expected a non-empty string"});
    return null;
  }
  return input;
}

function readOptionalString(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string") {
    issues.push({path, message: "expected a string or null"});
    return null;
  }
  return input;
}

function readOptionalMessageBridge(
  input: unknown,
  path: string,
  issues: Array<ValidationIssue>,
): {readonly port: number; readonly authToken: string} | null {
  if (input === undefined || input === null) return null;
  const objectValue = readObject(input, path, issues);
  if (!objectValue) return null;
  const port = readInteger(objectValue.port, `${path}.port`, issues);
  const authToken = readNonEmptyString(objectValue.authToken, `${path}.authToken`, issues);
  if (port === null || authToken === null) {
    return null;
  }
  return {port, authToken};
}

function readOptionalStringArray(input: unknown, path: string, issues: Array<ValidationIssue>): ReadonlyArray<string> | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    issues.push({path, message: "expected an array of strings"});
    return null;
  }
  const values: Array<string> = [];
  for (const [index, value] of input.entries()) {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push({path: `${path}[${index}]`, message: "expected a non-empty string"});
      continue;
    }
    values.push(value);
  }
  return values;
}

function readBoolean(input: unknown, path: string, issues: Array<ValidationIssue>): boolean | null {
  if (typeof input !== "boolean") {
    issues.push({path, message: "expected a boolean"});
    return null;
  }
  return input;
}

function readRequiredIsoDate(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  if (typeof input !== "string" || !ISO_DATE_TIME_PATTERN.test(input)) {
    issues.push({path, message: "expected an ISO-8601 UTC timestamp"});
    return null;
  }
  return input;
}

function readOptionalIsoDate(input: unknown, path: string, issues: Array<ValidationIssue>): string | null {
  if (input === undefined || input === null) return null;
  return readRequiredIsoDate(input, path, issues);
}

function readInteger(input: unknown, path: string, issues: Array<ValidationIssue>): number | null {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > 65535) {
    issues.push({path, message: "expected an integer between 1 and 65535"});
    return null;
  }
  return input;
}

function readEnum<T extends string>(input: unknown, path: string, allowedValues: ReadonlySet<T>, issues: Array<ValidationIssue>): T | null {
  if (typeof input !== "string" || !allowedValues.has(input as T)) {
    issues.push({path, message: `expected one of: ${Array.from(allowedValues).join(", ")}`});
    return null;
  }
  return input as T;
}

function readOptionalEnum<T extends string>(input: unknown, path: string, allowedValues: ReadonlySet<T>, issues: Array<ValidationIssue>): T | null {
  if (input === undefined || input === null) return null;
  return readEnum(input, path, allowedValues, issues);
}

function failure<T>(issues: ReadonlyArray<ValidationIssue>): ValidationResult<T> {
  return {success: false, issues};
}

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}
