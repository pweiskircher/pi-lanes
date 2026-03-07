// pattern: Imperative Shell

import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {cac} from "cac";
import {createLane} from "./functional-core/lane-registry-transitions.js";
import {
  approveProposedTodo,
  createHumanTodo,
  deleteTodo,
  editTodo,
  rejectProposedTodo,
  setTodoStatus,
} from "./functional-core/todo-transitions.js";
import {formatLaneBriefing} from "./functional-core/lane-briefing.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimeLastHumanInstruction,
  setRuntimeMode,
  setRuntimePendingQuestion,
  setRuntimeSummary,
} from "./functional-core/runtime-state.js";
import {
  assertWorkspaceExists,
  getDefaultLanePaths,
  getLaneById,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneRegistry,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "./imperative-shell/lane-store.js";
import {ensurePiExists, launchPi} from "./imperative-shell/pi-launch.js";
import {hasSavedPiSessionForCwd} from "./imperative-shell/pi-session-discovery.js";
import type {
  CreateHumanTodoOptions,
  Lane,
  LanePriority,
  LaneRuntimeMode,
  LaneRuntimeState,
  LaneStatus,
  LaneTodo,
  LaneTodoFile,
  TodoPriority,
  TodoStatus,
} from "./types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);
const todoStatuses = new Set<TodoStatus>(["open", "in_progress", "blocked", "done", "dropped"]);
const runtimeModes = new Set<LaneRuntimeMode>(["idle", "interactive", "working", "waiting_for_input", "blocked", "stopped"]);
const lanePriorities = new Set<LanePriority>(["main", "side", "parked"]);
const laneStatuses = new Set<LaneStatus>(["active", "paused", "archived"]);

type OutputMode = "text" | "json";

type CommandContext = {
  readonly outputMode: OutputMode;
};

type JsonOption = {
  readonly json?: boolean;
};

type StartOptions = JsonOption & {
  readonly dryRun?: boolean;
};

type NewLaneOptions = JsonOption & {
  readonly title?: string;
  readonly workspace?: string;
  readonly repo?: string;
  readonly bookmark?: string;
  readonly port?: string | number;
  readonly sessionName?: string;
  readonly serverCommand?: string;
  readonly priority?: string;
  readonly status?: string;
  readonly notes?: string;
  readonly tags?: string;
};

type TodoAddOptions = JsonOption & {
  readonly title?: string;
  readonly priority?: string;
  readonly notes?: string;
};

type TodoEditOptions = JsonOption & {
  readonly title?: string;
  readonly priority?: string;
  readonly notes?: string;
};

type RuntimeTextOptions = JsonOption & {
  readonly text?: string;
};

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  const cli = cac("pi-lane");
  cli.help();
  cli.version("0.1.0");

  cli
    .command("list", "List all lanes")
    .option("--json", "Output JSON")
    .action(async (options: JsonOption) => {
      await runWithHandling(() => runListCommand(createCommandContext(options)));
    });

  cli
    .command("show <laneId>", "Show one lane")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runShowCommand(laneId, createCommandContext(options)));
    });

  cli
    .command("start <laneId>", "Start a lane")
    .option("--dry-run", "Update runtime state but do not launch pi")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: StartOptions) => {
      await runWithHandling(() => runStartCommand(laneId, createCommandContext(options), options));
    });

  cli
    .command("new <laneId>", "Create a new lane")
    .option("--title <title>", "Lane title")
    .option("--workspace <workspace>", "Lane workspace path")
    .option("--repo <repo>", "Repository root path")
    .option("--bookmark <bookmark>", "jj bookmark")
    .option("--port <port>", "Dev server port")
    .option("--session-name <sessionName>", "pi session name")
    .option("--server-command <serverCommand>", "Dev server command")
    .option("--priority <priority>", "Lane priority")
    .option("--status <status>", "Lane status")
    .option("--notes <notes>", "Lane notes")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: NewLaneOptions) => {
      await runWithHandling(() => runNewLaneCommand(laneId, createCommandContext(options), options));
    });

  cli
    .command("todo list <laneId>", "List TODOs for a lane")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoListCommand(laneId, createCommandContext(options)));
    });

  cli
    .command("todo add <laneId>", "Add a TODO")
    .option("--title <title>", "TODO title")
    .option("--priority <priority>", "TODO priority")
    .option("--notes <notes>", "TODO notes")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: TodoAddOptions) => {
      await runWithHandling(() => runTodoAddCommand(laneId, createCommandContext(options), options));
    });

  cli
    .command("todo approve <laneId> <todoId>", "Approve an LLM-proposed TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoApproveCommand(laneId, todoId, createCommandContext(options)));
    });

  cli
    .command("todo reject <laneId> <todoId>", "Reject an LLM-proposed TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoRejectCommand(laneId, todoId, createCommandContext(options)));
    });

  cli
    .command("todo edit <laneId> <todoId>", "Edit a TODO")
    .option("--title <title>", "New title")
    .option("--priority <priority>", "New priority")
    .option("--notes <notes>", "New notes")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: TodoEditOptions) => {
      await runWithHandling(() => runTodoEditCommand(laneId, todoId, createCommandContext(options), options));
    });

  cli
    .command("todo delete <laneId> <todoId>", "Delete a TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoDeleteCommand(laneId, todoId, createCommandContext(options)));
    });

  cli
    .command("todo set-status <laneId> <todoId> <status>", "Set TODO status")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, status: string, options: JsonOption) => {
      await runWithHandling(() => runTodoSetStatusCommand(laneId, todoId, status, createCommandContext(options)));
    });

  cli
    .command("runtime show <laneId>", "Show runtime state")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeShowCommand(laneId, createCommandContext(options)));
    });

  cli
    .command("runtime set-summary <laneId>", "Set runtime summary")
    .option("--text <text>", "Summary text")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: RuntimeTextOptions) => {
      await runWithHandling(() => runRuntimeSetSummaryCommand(laneId, createCommandContext(options), options));
    });

  cli
    .command("runtime set-question <laneId>", "Set pending question")
    .option("--text <text>", "Question text")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: RuntimeTextOptions) => {
      await runWithHandling(() => runRuntimeSetQuestionCommand(laneId, createCommandContext(options), options));
    });

  cli
    .command("runtime set-current-todo <laneId> <todoId>", "Set current runtime TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeSetCurrentTodoCommand(laneId, todoId, createCommandContext(options)));
    });

  cli
    .command("runtime clear-current-todo <laneId>", "Clear current runtime TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeClearCurrentTodoCommand(laneId, createCommandContext(options)));
    });

  cli
    .command("runtime set-mode <laneId> <mode>", "Set runtime mode")
    .option("--json", "Output JSON")
    .action(async (laneId: string, mode: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeSetModeCommand(laneId, mode, createCommandContext(options)));
    });

  cli
    .command("runtime set-last-human-instruction <laneId>", "Set last human instruction")
    .option("--text <text>", "Instruction text")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: RuntimeTextOptions) => {
      await runWithHandling(() => runRuntimeSetLastHumanInstructionCommand(laneId, createCommandContext(options), options));
    });

  cli.parse([...argv], {run: false});
  const matchedCommand = cli.matchedCommand;
  if (!matchedCommand) {
    cli.outputHelp();
    return 1;
  }

  await cli.runMatchedCommand();
  return 0;
}

function createCommandContext(options: JsonOption): CommandContext {
  return {
    outputMode: options.json === true ? "json" : "text",
  };
}

async function runWithHandling(action: () => Promise<number>): Promise<void> {
  try {
    const exitCode = await action();
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

async function runStartCommand(laneId: string, context: CommandContext, options: StartOptions): Promise<number> {
  const dryRun = options.dryRun === true;
  const paths = getDefaultLanePaths(process.cwd());
  if (!existsSync(paths.configPath)) {
    throw new Error(`lane registry not found: ${paths.configPath}`);
  }

  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  await assertWorkspaceExists(lane.workspacePath);

  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const existingRuntimeState = await loadLaneRuntimeState(paths, lane.id);
  const runtimeState = createStartedRuntimeState({lane, existingRuntimeState, now: toIsoNow()});

  await saveLaneRuntimeState(paths, runtimeState);

  const briefing = buildLaneDetail(lane, runtimeState, todoFile);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "start", lane: briefing, dryRun});
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
  const exitCode = await launchPi({cwd: lane.workspacePath, continueSession});
  await saveLaneRuntimeState(paths, createStoppedRuntimeState(runtimeState, toIsoNow()));
  return exitCode;
}

async function runNewLaneCommand(laneId: string, context: CommandContext, options: NewLaneOptions): Promise<number> {
  if (!options.title) {
    throw new Error("missing required flag: --title");
  }
  if (!options.workspace) {
    throw new Error("missing required flag: --workspace");
  }
  if (!options.repo) {
    throw new Error("missing required flag: --repo");
  }
  if (!options.bookmark) {
    throw new Error("missing required flag: --bookmark");
  }
  if (options.port === undefined) {
    throw new Error("missing required flag: --port");
  }

  const paths = getDefaultLanePaths(process.cwd());
  const lanes = await loadLaneRegistry(paths);
  const sessionName = options.sessionName ?? laneId;
  const priority = options.priority === undefined ? null : parseLanePriority(options.priority);
  const status = options.status === undefined ? "active" : parseLaneStatus(options.status);
  const port = parsePortOption(options.port);
  const tags = parseTagsOption(options.tags);

  const result = createLane(lanes, {
    id: laneId,
    title: options.title,
    workspacePath: options.workspace,
    repoPath: options.repo,
    jjBookmark: options.bookmark,
    port,
    sessionName,
    serverCommand: options.serverCommand ?? null,
    priority,
    status,
    notes: options.notes ?? null,
    tags,
  });
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneRegistry(paths, result.data);
  await saveLaneTodoFile(paths, {laneId, todos: []});

  const createdLane = mustFindLane(result.data, laneId);
  const now = toIsoNow();
  await saveLaneRuntimeState(
    paths,
    createStoppedRuntimeState(
      createStartedRuntimeState({
        lane: createdLane,
        existingRuntimeState: null,
        now,
      }),
      now,
    ),
  );
  if (context.outputMode === "json") {
    printJson({ok: true, action: "lane.new", lane: createdLane});
  } else {
    console.log(`Created lane ${laneId}`);
  }
  return 0;
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
    console.log(`${summary.id}  ${summary.stateLabel}  port=${summary.port}  open=${summary.todoCounts.open}  proposed=${summary.todoCounts.proposed}`);
  }

  return 0;
}

async function runShowCommand(laneId: string, context: CommandContext): Promise<number> {
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

async function runTodoListCommand(laneId: string, context: CommandContext): Promise<number> {
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

async function runTodoAddCommand(laneId: string, context: CommandContext, options: TodoAddOptions): Promise<number> {
  if (!options.title) {
    throw new Error("missing required flag: --title");
  }

  const priority = parseTodoPriority(options.priority ?? "medium");
  const notes = options.notes ?? null;
  const paths = getDefaultLanePaths(process.cwd());
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const now = toIsoNow();
  const result = createHumanTodo(todoFile, createHumanTodoOptions({title: options.title, priority, notes, now, existingTodos: todoFile.todos}));
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }

  await saveLaneTodoFile(paths, result.data);
  const createdTodo = mustFindTodo(result.data, result.data.todos[result.data.todos.length - 1]?.id ?? "");
  if (context.outputMode === "json") {
    printJson({ok: true, action: "todo.add", laneId: lane.id, todo: createdTodo});
  } else {
    console.log(`Created TODO in ${lane.id}: ${options.title}`);
  }
  return 0;
}

async function runTodoApproveCommand(laneId: string, todoId: string, context: CommandContext): Promise<number> {
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

async function runTodoRejectCommand(laneId: string, todoId: string, context: CommandContext): Promise<number> {
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

async function runTodoEditCommand(laneId: string, todoId: string, context: CommandContext, options: TodoEditOptions): Promise<number> {
  const priority = options.priority === undefined ? null : parseTodoPriority(options.priority);
  const paths = getDefaultLanePaths(process.cwd());
  getLaneById(await loadLaneRegistry(paths), laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const result = editTodo(todoFile, todoId, {title: options.title ?? null, notes: options.notes ?? null, priority}, toIsoNow());
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

async function runTodoDeleteCommand(laneId: string, todoId: string, context: CommandContext): Promise<number> {
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

async function runTodoSetStatusCommand(laneId: string, todoId: string, statusValue: string, context: CommandContext): Promise<number> {
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

async function runRuntimeShowCommand(laneId: string, context: CommandContext): Promise<number> {
  const {runtimeState} = await loadRuntimeCommandState(laneId);
  if (context.outputMode === "json") {
    printJson({ok: true, laneId, runtimeState});
  } else {
    console.log(JSON.stringify(runtimeState, null, 2));
  }
  return 0;
}

async function runRuntimeSetSummaryCommand(laneId: string, context: CommandContext, options: RuntimeTextOptions): Promise<number> {
  if (options.text === undefined) {
    throw new Error("missing required flag: --text");
  }
  const {paths, runtimeState} = await loadRuntimeCommandState(laneId);
  const updated = setRuntimeSummary(runtimeState, options.text, toIsoNow());
  await saveLaneRuntimeState(paths, updated);
  return printRuntimeMutationResult(context, "runtime.set-summary", laneId, updated, `Updated summary for ${laneId}`);
}

async function runRuntimeSetQuestionCommand(laneId: string, context: CommandContext, options: RuntimeTextOptions): Promise<number> {
  if (options.text === undefined) {
    throw new Error("missing required flag: --text");
  }
  const {paths, runtimeState} = await loadRuntimeCommandState(laneId);
  const updated = setRuntimePendingQuestion(runtimeState, options.text, toIsoNow());
  await saveLaneRuntimeState(paths, updated);
  return printRuntimeMutationResult(context, "runtime.set-question", laneId, updated, `Updated pending question for ${laneId}`);
}

async function runRuntimeSetCurrentTodoCommand(laneId: string, todoId: string, context: CommandContext): Promise<number> {
  const {paths, runtimeState, todoFile} = await loadRuntimeCommandState(laneId);
  const result = setRuntimeCurrentTodo(runtimeState, todoFile, todoId, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }
  await saveLaneRuntimeState(paths, result.data);
  return printRuntimeMutationResult(context, "runtime.set-current-todo", laneId, result.data, `Set current todo for ${laneId} to ${todoId}`);
}

async function runRuntimeClearCurrentTodoCommand(laneId: string, context: CommandContext): Promise<number> {
  const {paths, runtimeState, todoFile} = await loadRuntimeCommandState(laneId);
  const result = setRuntimeCurrentTodo(runtimeState, todoFile, null, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }
  await saveLaneRuntimeState(paths, result.data);
  return printRuntimeMutationResult(context, "runtime.clear-current-todo", laneId, result.data, `Cleared current todo for ${laneId}`);
}

async function runRuntimeSetModeCommand(laneId: string, mode: string, context: CommandContext): Promise<number> {
  const parsedMode = parseRuntimeMode(mode);
  const {paths, runtimeState} = await loadRuntimeCommandState(laneId);
  const result = setRuntimeMode(runtimeState, parsedMode, toIsoNow());
  if (!result.success) {
    throw new Error(result.issues.map(issue => issue.message).join("; "));
  }
  await saveLaneRuntimeState(paths, result.data);
  return printRuntimeMutationResult(context, "runtime.set-mode", laneId, result.data, `Set runtime mode for ${laneId} to ${parsedMode}`);
}

async function runRuntimeSetLastHumanInstructionCommand(laneId: string, context: CommandContext, options: RuntimeTextOptions): Promise<number> {
  if (options.text === undefined) {
    throw new Error("missing required flag: --text");
  }
  const {paths, runtimeState} = await loadRuntimeCommandState(laneId);
  const updated = setRuntimeLastHumanInstruction(runtimeState, options.text, toIsoNow());
  await saveLaneRuntimeState(paths, updated);
  return printRuntimeMutationResult(context, "runtime.set-last-human-instruction", laneId, updated, `Updated last human instruction for ${laneId}`);
}

async function loadRuntimeCommandState(laneId: string): Promise<{
  readonly paths: ReturnType<typeof getDefaultLanePaths>;
  readonly runtimeState: LaneRuntimeState;
  readonly todoFile: LaneTodoFile;
}> {
  const paths = getDefaultLanePaths(process.cwd());
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const now = toIsoNow();
  const runtimeState =
    (await loadLaneRuntimeState(paths, laneId)) ?? createStoppedRuntimeState(createStartedRuntimeState({lane, existingRuntimeState: null, now}), now);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  return {paths, runtimeState, todoFile};
}

function printRuntimeMutationResult(
  context: CommandContext,
  action: string,
  laneId: string,
  runtimeState: LaneRuntimeState,
  textMessage: string,
): number {
  if (context.outputMode === "json") {
    printJson({ok: true, action, laneId, runtimeState});
  } else {
    console.log(textMessage);
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

function mustFindLane(lanes: ReadonlyArray<Lane>, laneId: string): Lane {
  const lane = lanes.find(candidate => candidate.id === laneId);
  if (!lane) {
    throw new Error(`lane not found after operation: ${laneId}`);
  }
  return lane;
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

function parseRuntimeMode(input: string): LaneRuntimeMode {
  if (!runtimeModes.has(input as LaneRuntimeMode)) {
    throw new Error(`invalid runtime mode: ${input}`);
  }
  return input as LaneRuntimeMode;
}

function parseLanePriority(input: string): LanePriority {
  if (!lanePriorities.has(input as LanePriority)) {
    throw new Error(`invalid lane priority: ${input}`);
  }
  return input as LanePriority;
}

function parseLaneStatus(input: string): LaneStatus {
  if (!laneStatuses.has(input as LaneStatus)) {
    throw new Error(`invalid lane status: ${input}`);
  }
  return input as LaneStatus;
}

function parsePortOption(input: string | number): number {
  const port = typeof input === "number" ? input : Number.parseInt(input, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port: ${input}`);
  }
  return port;
}

function parseTagsOption(input: string | undefined): ReadonlyArray<string> {
  if (!input) {
    return [];
  }
  return input
    .split(",")
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function toIsoNow(): string {
  return new Date().toISOString();
}

const isDirectExecution = import.meta.url === `file://${resolve(process.argv[1] ?? "")}`;
if (isDirectExecution) {
  void main(process.argv.slice(2)).then(exitCode => {
    process.exitCode = exitCode;
  });
}
