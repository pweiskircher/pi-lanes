// pattern: Imperative Shell

import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {createHumanTodo, approveProposedTodo, rejectProposedTodo} from "./functional-core/todo-transitions.js";
import {formatLaneBriefing} from "./functional-core/lane-briefing.js";
import {createStartedRuntimeState, createStoppedRuntimeState} from "./functional-core/runtime-state.js";
import {assertWorkspaceExists, getDefaultLanePaths, getLaneById, loadLaneRegistry, loadLaneRuntimeState, loadLaneTodoFile, saveLaneRuntimeState, saveLaneTodoFile} from "./imperative-shell/lane-store.js";
import {ensurePiExists, launchPi} from "./imperative-shell/pi-launch.js";
import {hasSavedPiSessionForCwd} from "./imperative-shell/pi-session-discovery.js";
import type {CreateHumanTodoOptions, LaneTodo, TodoPriority} from "./types.js";

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  try {
    const [command, ...rest] = argv;

    switch (command) {
      case "start":
        return await runStartCommand(rest);
      case "list":
        return await runListCommand();
      case "show":
        return await runShowCommand(rest);
      case "todo":
        return await runTodoCommand(rest);
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

async function runStartCommand(argv: ReadonlyArray<string>): Promise<number> {
  const laneId = argv[0];
  const dryRun = argv.includes("--dry-run");
  if (!laneId) {
    throw new Error("usage: pi-lane start <lane-id> [--dry-run]");
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
  console.log(formatLaneBriefing({lane, runtimeState, todoFile}));
  console.log("");

  if (dryRun) {
    console.log("Dry run only. Runtime state updated, but pi was not launched.");
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

async function runListCommand(): Promise<number> {
  const paths = getDefaultLanePaths(process.cwd());
  const lanes = await loadLaneRegistry(paths);

  for (const lane of lanes) {
    const runtimeState = await loadLaneRuntimeState(paths, lane.id);
    const todoFile = await loadLaneTodoFile(paths, lane.id);
    const openCount = todoFile.todos.filter(todo => todo.status === "open").length;
    const proposedCount = todoFile.todos.filter(todo => todo.status === "proposed").length;
    const stateLabel = runtimeState?.isActive ? runtimeState.mode : "cold";
    console.log(`${lane.id}  ${stateLabel}  port=${lane.port}  open=${openCount}  proposed=${proposedCount}`);
  }

  return 0;
}

async function runShowCommand(argv: ReadonlyArray<string>): Promise<number> {
  const laneId = argv[0];
  if (!laneId) {
    throw new Error("usage: pi-lane show <lane-id>");
  }

  const paths = getDefaultLanePaths(process.cwd());
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const runtimeState = await loadLaneRuntimeState(paths, lane.id);

  console.log(formatLaneBriefing({lane, runtimeState, todoFile}));
  if (todoFile.todos.length > 0) {
    console.log("\nTODOs:");
    for (const todo of todoFile.todos) {
      console.log(`- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`);
    }
  }

  return 0;
}

async function runTodoCommand(argv: ReadonlyArray<string>): Promise<number> {
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "add":
      return await runTodoAddCommand(rest);
    case "approve":
      return await runTodoApproveCommand(rest);
    case "reject":
      return await runTodoRejectCommand(rest);
    default:
      throw new Error("usage: pi-lane todo <add|approve|reject> ...");
  }
}

async function runTodoAddCommand(argv: ReadonlyArray<string>): Promise<number> {
  const laneId = argv[0];
  if (!laneId) {
    throw new Error("usage: pi-lane todo add <lane-id> --title <title> [--priority high|medium|low] [--notes <notes>]");
  }

  const title = readFlagValue(argv, "--title");
  if (!title) {
    throw new Error("missing required flag: --title");
  }

  const priority = (readFlagValue(argv, "--priority") ?? "medium") as TodoPriority;
  if (!["low", "medium", "high"].includes(priority)) {
    throw new Error(`invalid priority: ${priority}`);
  }

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
  console.log(`Created TODO in ${lane.id}: ${title}`);
  return 0;
}

async function runTodoApproveCommand(argv: ReadonlyArray<string>): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo approve <lane-id> <todo-id>");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = approveProposedTodo(todoFile, todoId, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  console.log(`Approved TODO ${todoId} in ${laneId}`);
  return 0;
}

async function runTodoRejectCommand(argv: ReadonlyArray<string>): Promise<number> {
  const [laneId, todoId] = argv;
  if (!laneId || !todoId) {
    throw new Error("usage: pi-lane todo reject <lane-id> <todo-id>");
  }

  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = rejectProposedTodo(todoFile, todoId, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  console.log(`Rejected TODO ${todoId} in ${laneId}`);
  return 0;
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

function readFlagValue(argv: ReadonlyArray<string>, flagName: string): string | null {
  const index = argv.indexOf(flagName);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function printUsage(): void {
  console.log(`pi-lane commands:\n  pi-lane start <lane-id> [--dry-run]\n  pi-lane list\n  pi-lane show <lane-id>\n  pi-lane todo add <lane-id> --title <title> [--priority high|medium|low] [--notes <notes>]\n  pi-lane todo approve <lane-id> <todo-id>\n  pi-lane todo reject <lane-id> <todo-id>`);
}

const isDirectExecution = import.meta.url === `file://${resolve(process.argv[1] ?? "")}`;
if (isDirectExecution) {
  void main(process.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode;
  });
}
