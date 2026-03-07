// pattern: Imperative Shell

import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {
  approveProposedTodo,
  createHumanTodo,
  deleteTodo,
  editTodo,
  rejectProposedTodo,
  setTodoStatus,
} from "./functional-core/todo-transitions.js";
import {formatLaneBriefing} from "./functional-core/lane-briefing.js";
import {createStartedRuntimeState, createStoppedRuntimeState} from "./functional-core/runtime-state.js";
import {
  assertWorkspaceExists,
  getDefaultLanePaths,
  getLaneById,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "./imperative-shell/lane-store.js";
import {ensurePiExists, launchPi} from "./imperative-shell/pi-launch.js";
import {hasSavedPiSessionForCwd} from "./imperative-shell/pi-session-discovery.js";
import type {CreateHumanTodoOptions, Lane, LaneRuntimeState, LaneTodo, LaneTodoFile, TodoPriority, TodoStatus} from "./types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);
const todoStatuses = new Set<TodoStatus>(["open", "in_progress", "blocked", "done", "dropped"]);

type OutputMode = "text" | "json";

type CommandContext = {
  readonly outputMode: OutputMode;
};

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  try {
    const parsed = parseGlobalFlags(argv);
    const context: CommandContext = {
      outputMode: parsed.outputMode,
    };
    const [command, ...rest] = parsed.argv;

    switch (command) {
      case "start":
        return await runStartCommand(rest, context);
      case "list":
        return await runListCommand(context);
      case "show":
        return await runShowCommand(rest, context);
      case "todo":
        return await runTodoCommand(rest, context);
      case undefined:
        printUsage();
        return 1;
      default:
        throw new Error(`unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  }
}

async function runStartCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const laneId = argv[0];
  const dryRun = argv.includes("--dry-run");
  if (!laneId) {
    throw new Error("usage: pi-lane start <lane-id> [--dry-run] [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  if (!existsSync(paths.configPath)) {
    throw new Error(`lane registry not found: ${paths.configPath}`);
  }

  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  await assertWorkspaceExists(lane.workspacePath);

  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const existingRuntimeState = await loadLaneRuntimeState(paths, lane.id);
  const runtimeState = createStartedRuntimeState({
    lane,
    existingRuntimeState,
    now: toIsoNow(),
  });

  await saveLaneRuntimeState(paths, runtimeState);

  const briefing = buildLaneDetail(lane, runtimeState, todoFile);
  if (context.outputMode === "json") {
    printJson({
      ok: true,
      action: "start",
      lane: briefing,
      dryRun,
    });
  } else {
    console.log(formatLaneBriefing({lane, runtimeState, todoFile}));
    console.log("");
  }

  if (dryRun) {
    if (context.outputMode === "text") {
      console.log("Dry run only. Runtime state updated, but pi was not launched.");
    }
    return 0;
  }

  await ensurePiExists();
  const continueSession = await hasSavedPiSessionForCwd(lane.workspacePath);
  const exitCode = await launchPi({
    cwd: lane.workspacePath,
    continueSession,
  });

  await saveLaneRuntimeState(paths, createStoppedRuntimeState(runtimeState, toIsoNow()));
  return exitCode;
}

async function runListCommand(context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths(process.cwd());
  const lanes = await loadLaneRegistry(paths);
  const summaries = await Promise.all(
    lanes.map(async lane => {
      const runtimeState = await loadLaneRuntimeState(paths, lane.id);
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      return buildLaneSummary(lane, runtimeState, todoFile);
    }),
  );

  if (context.outputMode === "json") {
    printJson({ok: true, lanes: summaries});
    return 0;
  }

  for (const summary of summaries) {
    console.log(
      `${summary.id}  ${summary.stateLabel}  port=${summary.port}  open=${summary.todoCounts.open}  proposed=${summary.todoCounts.proposed}`,
    );
  }

  return 0;
}

async function runShowCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const laneId = argv[0];
  if (!laneId) {
    throw new Error("usage: pi-lane show <lane-id> [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const runtimeState = await loadLaneRuntimeState(paths, lane.id);
  const detail = buildLaneDetail(lane, runtimeState, todoFile);

  if (context.outputMode === "json") {
    printJson({ok: true, lane: detail});
    return 0;
  }

  console.log(formatLaneBriefing({lane, runtimeState, todoFile}));
  if (todoFile.todos.length > 0) {
    console.log("\nTODOs:");
    for (const todo of todoFile.todos) {
      console.log(`- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`);
    }
  }

  return 0;
}

async function runTodoCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "list":
      return await runTodoListCommand(rest, context);
    case "add":
      return await runTodoAddCommand(rest, context);
    case "approve":
      return await runTodoApproveCommand(rest, context);
    case "reject":
      return await runTodoRejectCommand(rest, context);
    case "edit":
      return await runTodoEditCommand(rest, context);
    case "delete":
      return await runTodoDeleteCommand(rest, context);
    case "set-status":
      return await runTodoSetStatusCommand(rest, context);
    default:
      throw new Error("usage: pi-lane todo <list|add|approve|reject|edit|delete|set-status> ...");
  }
}

async function runTodoListCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const laneId = argv[0];
  if (!laneId) {
    throw new Error("usage: pi-lane todo list <lane-id> [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);

  if (context.outputMode === "json") {
    printJson({ok: true, laneId, todos: todoFile.todos, grouped: groupTodos(todoFile)});
    return 0;
  }

  if (todoFile.todos.length === 0) {
    console.log(`No TODOs for ${laneId}`);
    return 0;
  }

  for (const todo of todoFile.todos) {
    console.log(`- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`);
  }
  return 0;
}

async function runTodoAddCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const laneId = argv[0];
  if (!laneId) {
    throw new Error("usage: pi-lane todo add <lane-id> --title <title> [--priority high|medium|low] [--notes <notes>] [--json]");
  }

  const title = readFlagValue(argv, "--title");
  if (!title) {
    throw new Error("missing required flag: --title");
  }

  const priority = parseTodoPriority(readFlagValue(argv, "--priority") ?? "medium");
  const notes = readFlagValue(argv, "--notes") ?? null;
  const paths = getDefaultLanePaths(process.cwd());
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const now = toIsoNow();
  const result = createHumanTodo(todoFile, createHumanTodoOptions({title, priority, notes, now, existingTodos: todoFile.todos}));
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const createdTodo = mustFindTodo(result.data, result.data.todos[result.data.todos.length - 1]?.id ?? "");
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.add", laneId: lane.id, todo: createdTodo});
  } else {
    console.log(`Created TODO in ${lane.id}: ${title}`);
  }
  return 0;
}

async function runTodoApproveCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo approve <lane-id> <todo-id> [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = approveProposedTodo(todoFile, todoId, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const todo = mustFindTodo(result.data, todoId);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.approve", laneId, todo});
  } else {
    console.log(`Approved TODO ${todoId} in ${laneId}`);
  }
  return 0;
}

async function runTodoRejectCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo reject <lane-id> <todo-id> [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = rejectProposedTodo(todoFile, todoId, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const todo = mustFindTodo(result.data, todoId);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.reject", laneId, todo});
  } else {
    console.log(`Rejected TODO ${todoId} in ${laneId}`);
  }
  return 0;
}

async function runTodoEditCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo edit <lane-id> <todo-id> [--title <title>] [--notes <notes>] [--priority high|medium|low] [--json]");
  }

  const title = readFlagValue(argv, "--title");
  const notes = readFlagValue(argv, "--notes");
  const priorityValue = readFlagValue(argv, "--priority");
  const priority = priorityValue === null ? null : parseTodoPriority(priorityValue);

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = editTodo(
    todoFile,
    todoId,
    {
      title,
      notes,
      priority,
    },
    toIsoNow(),
  );
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const todo = mustFindTodo(result.data, todoId);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.edit", laneId, todo});
  } else {
    console.log(`Edited TODO ${todoId} in ${laneId}`);
  }
  return 0;
}

async function runTodoDeleteCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo delete <lane-id> <todo-id> [--json]");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const deletedTodo = mustFindTodo(todoFile, todoId);
  const result = deleteTodo(todoFile, todoId);
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.delete", laneId, todo: deletedTodo});
  } else {
    console.log(`Deleted TODO ${todoId} from ${laneId}`);
  }
  return 0;
}

async function runTodoSetStatusCommand(argv: ReadonlyArray<string>, context: CommandContext): Promise<number> {
  const [laneId, todoId, statusValue] = argv;
  if (!laneId || !todoId || !statusValue) {
    throw new Error("usage: pi-lane todo set-status <lane-id> <todo-id> <open|in_progress|blocked|done|dropped> [--json]");
  }

  const status = parseTodoStatus(statusValue);
  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = setTodoStatus(todoFile, todoId, status, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const todo = mustFindTodo(result.data, todoId);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.set-status", laneId, todo});
  } else {
    console.log(`Set TODO ${todoId} in ${laneId} to ${status}`);
  }
  return 0;
}

function buildLaneSummary(lane: Lane, runtimeState: LaneRuntimeState | null, todoFile: LaneTodoFile) {
  return {
    id: lane.id,
    title: lane.title,
    port: lane.port,
    sessionName: lane.sessionName,
    workspacePath: lane.workspacePath,
    jjBookmark: lane.jjBookmark,
    isActive: runtimeState?.isActive ?? false,
    stateLabel: runtimeState?.isActive ? runtimeState.mode : "cold",
    currentTodoId: runtimeState?.currentTodoId ?? null,
    currentSummary: runtimeState?.currentSummary ?? null,
    pendingQuestion: runtimeState?.pendingQuestion ?? null,
    todoCounts: countTodos(todoFile),
  };
}

function buildLaneDetail(lane: Lane, runtimeState: LaneRuntimeState | null, todoFile: LaneTodoFile) {
  return {
    ...buildLaneSummary(lane, runtimeState, todoFile),
    lane,
    runtimeState,
    todos: todoFile.todos,
    groupedTodos: groupTodos(todoFile),
  };
}

function countTodos(todoFile: LaneTodoFile) {
  return {
    proposed: todoFile.todos.filter(todo => todo.status === "proposed").length,
    open: todoFile.todos.filter(todo => todo.status === "open").length,
    inProgress: todoFile.todos.filter(todo => todo.status === "in_progress").length,
    blocked: todoFile.todos.filter(todo => todo.status === "blocked").length,
    done: todoFile.todos.filter(todo => todo.status === "done").length,
    dropped: todoFile.todos.filter(todo => todo.status === "dropped").length,
  };
}

function groupTodos(todoFile: LaneTodoFile) {
  return {
    proposed: todoFile.todos.filter(todo => todo.status === "proposed"),
    open: todoFile.todos.filter(todo => todo.status === "open"),
    inProgress: todoFile.todos.filter(todo => todo.status === "in_progress"),
    blocked: todoFile.todos.filter(todo => todo.status === "blocked"),
    done: todoFile.todos.filter(todo => todo.status === "done"),
    dropped: todoFile.todos.filter(todo => todo.status === "dropped"),
  };
}

function mustFindTodo(todoFile: LaneTodoFile, todoId: string): LaneTodo {
  const todo = todoFile.todos.find(candidate => candidate.id === todoId);
  if (!todo) {
    throw new Error(`todo not found after operation: ${todoId}`);
  }
  return todo;
}

function createHumanTodoOptions(options: {
  readonly title: string;
  readonly priority: TodoPriority;
  readonly notes: string | null;
  readonly now: string;
  readonly existingTodos: ReadonlyArray<LaneTodo>;
}): CreateHumanTodoOptions {
  return {
    title: options.title,
    priority: options.priority,
    notes: options.notes,
    now: options.now,
    id: createNextTodoId(options.existingTodos),
  };
}

function createNextTodoId(existingTodos: ReadonlyArray<LaneTodo>): string {
  let highestValue = 0;
  for (const todo of existingTodos) {
    const numericPart = Number.parseInt(todo.id.replace("todo-", ""), 10);
    if (Number.isNaN(numericPart)) {
      continue;
    }
    highestValue = Math.max(highestValue, numericPart);
  }
  return `todo-${String(highestValue + 1).padStart(3, "0")}`;
}

function parseTodoPriority(input: string): TodoPriority {
  if (!todoPriorities.has(input as TodoPriority)) {
    throw new Error(`invalid priority: ${input}`);
  }
  return input as TodoPriority;
}

function parseTodoStatus(input: string): TodoStatus {
  if (!todoStatuses.has(input as TodoStatus)) {
    throw new Error(`invalid status: ${input}`);
  }
  return input as TodoStatus;
}

function readFlagValue(argv: ReadonlyArray<string>, flagName: string): string | null {
  const index = argv.indexOf(flagName);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function parseGlobalFlags(argv: ReadonlyArray<string>): {readonly argv: ReadonlyArray<string>; readonly outputMode: OutputMode} {
  const filteredArgv: Array<string> = [];
  let outputMode: OutputMode = "text";

  for (const value of argv) {
    if (value === "--json") {
      outputMode = "json";
      continue;
    }
    filteredArgv.push(value);
  }

  return {
    argv: filteredArgv,
    outputMode,
  };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function printUsage(): void {
  console.log(`pi-lane commands:\n  pi-lane list [--json]\n  pi-lane show <lane-id> [--json]\n  pi-lane start <lane-id> [--dry-run] [--json]\n  pi-lane todo list <lane-id> [--json]\n  pi-lane todo add <lane-id> --title <title> [--priority high|medium|low] [--notes <notes>] [--json]\n  pi-lane todo approve <lane-id> <todo-id> [--json]\n  pi-lane todo reject <lane-id> <todo-id> [--json]\n  pi-lane todo edit <lane-id> <todo-id> [--title <title>] [--notes <notes>] [--priority high|medium|low] [--json]\n  pi-lane todo delete <lane-id> <todo-id> [--json]\n  pi-lane todo set-status <lane-id> <todo-id> <open|in_progress|blocked|done|dropped> [--json]`);
}

const isDirectExecution = import.meta.url === `file://${resolve(process.argv[1] ?? "")}`;
if (isDirectExecution) {
  void main(process.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode;
  });
}
