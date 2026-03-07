// pattern: Imperative Shell

import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {Command} from "commander";
import {createLane} from "./functional-core/lane-registry-transitions.js";
import {
  approveProposedTodo,
  createHumanTodo,
  deleteTodo,
  editTodo,
  rejectProposedTodo,
  setTodoStatus,
} from "./functional-core/todo-transitions.js";
import {buildDoctorLaneReport, buildDoctorReport} from "./functional-core/doctor.js";
import {formatLaneBriefing} from "./functional-core/lane-briefing.js";
import {formatLaneStartupPrompt} from "./functional-core/lane-startup-prompt.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimeMode,
} from "./functional-core/runtime-state.js";
import {
  assertRepoExists,
  ensureLaneHome,
  getDefaultLanePaths,
  getLaneById,
  getLaneContextPath,
  getLaneRuntimePath,
  getLaneTodoPath,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneRegistry,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "./imperative-shell/lane-store.js";
import {readTextFile, writeTextFile} from "./imperative-shell/json-files.js";
import {serveDashboard} from "./imperative-shell/dashboard-server.js";
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
  readonly id?: string;
  readonly title?: string;
  readonly repo?: string;
  readonly bookmark?: string;
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

type ContextEditOptions = JsonOption & {
  readonly text?: string;
  readonly editor?: string;
};

type DashboardServeOptions = {
  readonly port?: string | number;
};

export async function main(argv: ReadonlyArray<string> = process.argv): Promise<number> {
  const program = new Command();
  program.name("pi-lane").version("0.1.0").showHelpAfterError();

  program
    .command("list")
    .description("List all lanes")
    .option("--json", "Output JSON")
    .action(async (options: JsonOption) => {
      await runWithHandling(() => runListCommand(createCommandContext(options)));
    });

  program
    .command("show")
    .argument("<laneId>")
    .description("Show one lane")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runShowCommand(laneId, createCommandContext(options)));
    });

  program
    .command("start")
    .argument("<laneId>")
    .description("Start a lane")
    .option("--dry-run", "Update runtime state but do not launch pi")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: StartOptions) => {
      await runWithHandling(() => runStartCommand(laneId, createCommandContext(options), options));
    });

  program
    .command("new")
    .description("Create a new lane")
    .requiredOption("--id <id>", "Lane id")
    .requiredOption("--repo <repo>", "Repository root path")
    .option("--title <title>", "Lane title")
    .option("--bookmark <bookmark>", "jj bookmark")
    .option("--session-name <sessionName>", "pi session name")
    .option("--server-command <serverCommand>", "Dev server command")
    .option("--priority <priority>", "Lane priority")
    .option("--status <status>", "Lane status")
    .option("--notes <notes>", "Lane notes")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output JSON")
    .action(async (options: NewLaneOptions) => {
      await runWithHandling(() => runNewLaneCommand(createCommandContext(options), options));
    });

  program
    .command("doctor")
    .description("Check lane setup health")
    .option("--json", "Output JSON")
    .action(async (options: JsonOption) => {
      await runWithHandling(() => runDoctorCommand(createCommandContext(options)));
    });

  const dashboard = program.command("dashboard").description("Dashboard commands");
  dashboard
    .command("snapshot")
    .description("Emit a dashboard-friendly snapshot of all lanes")
    .option("--json", "Output JSON")
    .action(async (options: JsonOption) => {
      await runWithHandling(() => runDashboardSnapshotCommand(createCommandContext(options)));
    });
  dashboard
    .command("serve")
    .description("Run the local dashboard server")
    .option("--port <port>", "Dashboard port")
    .action(async (options: DashboardServeOptions) => {
      await runWithHandling(() => runDashboardServeCommand(options));
    });

  const todo = program.command("todo").description("TODO commands");
  todo
    .command("list")
    .argument("<laneId>")
    .description("List TODOs for a lane")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoListCommand(laneId, createCommandContext(options)));
    });
  todo
    .command("add")
    .argument("<laneId>")
    .description("Add a TODO")
    .requiredOption("--title <title>", "TODO title")
    .option("--priority <priority>", "TODO priority")
    .option("--notes <notes>", "TODO notes")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: TodoAddOptions) => {
      await runWithHandling(() => runTodoAddCommand(laneId, createCommandContext(options), options));
    });
  todo
    .command("approve")
    .argument("<laneId>")
    .argument("<todoId>")
    .description("Approve an LLM-proposed TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoApproveCommand(laneId, todoId, createCommandContext(options)));
    });
  todo
    .command("reject")
    .argument("<laneId>")
    .argument("<todoId>")
    .description("Reject an LLM-proposed TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoRejectCommand(laneId, todoId, createCommandContext(options)));
    });
  todo
    .command("edit")
    .argument("<laneId>")
    .argument("<todoId>")
    .description("Edit a TODO")
    .option("--title <title>", "New title")
    .option("--priority <priority>", "New priority")
    .option("--notes <notes>", "New notes")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: TodoEditOptions) => {
      await runWithHandling(() => runTodoEditCommand(laneId, todoId, createCommandContext(options), options));
    });
  todo
    .command("delete")
    .argument("<laneId>")
    .argument("<todoId>")
    .description("Delete a TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runTodoDeleteCommand(laneId, todoId, createCommandContext(options)));
    });
  todo
    .command("set-status")
    .argument("<laneId>")
    .argument("<todoId>")
    .argument("<status>")
    .description("Set TODO status")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, status: string, options: JsonOption) => {
      await runWithHandling(() => runTodoSetStatusCommand(laneId, todoId, status, createCommandContext(options)));
    });

  const runtime = program.command("runtime").description("Runtime commands");
  runtime
    .command("show")
    .argument("<laneId>")
    .description("Show runtime state")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeShowCommand(laneId, createCommandContext(options)));
    });
  runtime
    .command("set-current-todo")
    .argument("<laneId>")
    .argument("<todoId>")
    .description("Set current runtime TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, todoId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeSetCurrentTodoCommand(laneId, todoId, createCommandContext(options)));
    });
  runtime
    .command("clear-current-todo")
    .argument("<laneId>")
    .description("Clear current runtime TODO")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeClearCurrentTodoCommand(laneId, createCommandContext(options)));
    });
  runtime
    .command("set-mode")
    .argument("<laneId>")
    .argument("<mode>")
    .description("Set runtime mode")
    .option("--json", "Output JSON")
    .action(async (laneId: string, mode: string, options: JsonOption) => {
      await runWithHandling(() => runRuntimeSetModeCommand(laneId, mode, createCommandContext(options)));
    });
  const contextCommand = program.command("context").description("Lane context commands");
  contextCommand
    .command("show")
    .argument("<laneId>")
    .description("Show the lane context file")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: JsonOption) => {
      await runWithHandling(() => runContextShowCommand(laneId, createCommandContext(options)));
    });
  contextCommand
    .command("edit")
    .argument("<laneId>")
    .description("Edit the lane context file")
    .option("--text <text>", "Replace the context text directly instead of opening an editor")
    .option("--editor <editor>", "Editor command to use when opening interactively")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: ContextEditOptions) => {
      await runWithHandling(() => runContextEditCommand(laneId, createCommandContext(options), options));
    });

  if (argv.length <= 2) {
    program.outputHelp();
    return 1;
  }

  await program.parseAsync([...argv]);
  return typeof process.exitCode === "number" ? process.exitCode : 0;
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
  const paths = getDefaultLanePaths();
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  await assertRepoExists(lane.repoPath);

  const todoFile = await loadLaneTodoFile(paths, lane.id);
  const existingRuntimeState = await loadLaneRuntimeState(paths, lane.id);
  const now = toIsoNow();
  const runtimeState = createStartedRuntimeState({lane, existingRuntimeState, now});

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
  const continueSession = await hasSavedPiSessionForCwd(lane.repoPath);
  const laneContext = await readLaneContext(paths, lane.id);
  const initialMessages = continueSession
    ? []
    : [formatLaneStartupPrompt({lane, runtimeState, todoFile, laneContext})];
  const toolRoot = getToolRoot();
  const exitCode = await launchPi({
    cwd: lane.repoPath,
    continueSession,
    initialMessages,
    extensionPaths: [resolve(toolRoot, "extensions/lane-bridge.ts")],
    skillPaths: [
      resolve(toolRoot, "skills/lane-context/SKILL.md"),
      resolve(toolRoot, "skills/lane-todo-hygiene/SKILL.md"),
      resolve(toolRoot, "skills/lane-status-summary/SKILL.md"),
    ],
    environment: {
      ...process.env,
      PI_LANES_HOME: paths.rootPath,
      PI_LANE_ID: lane.id,
    },
  });
  await saveLaneRuntimeState(paths, createStoppedRuntimeState(runtimeState, toIsoNow()));
  return exitCode;
}

async function runDashboardSnapshotCommand(context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
  const lanes = await loadLaneRegistry(paths);
  const snapshot = await Promise.all(
    lanes.map(async lane => {
      const runtimeState = await loadLaneRuntimeState(paths, lane.id);
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      return buildLaneDetail(lane, runtimeState, todoFile);
    }),
  );

  if (context.outputMode === "json") {
    printJson({ok: true, generatedAt: toIsoNow(), lanes: snapshot});
  } else {
    for (const lane of snapshot) {
      console.log(`${lane.id}  ${lane.stateLabel}  open=${lane.todoCounts.open}  proposed=${lane.todoCounts.proposed}`);
    }
  }
  return 0;
}

async function runDashboardServeCommand(options: DashboardServeOptions): Promise<number> {
  const port = options.port === undefined ? 4310 : parsePortOption(options.port);
  await serveDashboard({configRootPath: getDefaultLanePaths().rootPath, toolRootPath: getToolRoot(), port});
  return await new Promise<number>(() => {
    // Keep process alive until terminated.
  });
}

async function runDoctorCommand(context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
  const lanes = await loadLaneRegistry(paths);
  let piAvailable = true;

  try {
    await ensurePiExists();
  } catch {
    piAvailable = false;
  }

  const laneReports = await Promise.all(
    lanes.map(async lane => {
      const todoPath = getLaneTodoPath(paths, lane.id);
      const runtimePath = getLaneRuntimePath(paths, lane.id);
      const contextPath = getLaneContextPath(paths, lane.id);
      const repoExists = existsSync(lane.repoPath);
      const todoFileExists = existsSync(todoPath);
      const runtimeFileExists = existsSync(runtimePath);
      const contextFileExists = existsSync(contextPath);
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      const runtimeState = await loadLaneRuntimeState(paths, lane.id);

      return buildDoctorLaneReport({
        lane,
        repoExists,
        todoFileExists,
        runtimeFileExists,
        contextFileExists,
        todoFile,
        runtimeState,
      });
    }),
  );

  const report = buildDoctorReport({piAvailable, lanes: laneReports});
  if (context.outputMode === "json") {
    printJson(report);
    return report.ok ? 0 : 1;
  }

  console.log(`pi available: ${report.piAvailable ? "yes" : "no"}`);
  console.log(`lane home: ${paths.rootPath}`);
  console.log(`lanes: ${report.laneCount}`);
  for (const lane of report.lanes) {
    console.log(`\n${lane.laneId}`);
    console.log(`  repo: ${lane.repoExists ? "ok" : "missing"}`);
    console.log(`  todo file: ${lane.todoFileExists ? "ok" : "missing"}`);
    console.log(`  runtime file: ${lane.runtimeFileExists ? "ok" : "missing"}`);
    console.log(`  context file: ${lane.contextFileExists ? "ok" : "missing"}`);
    if (lane.issues.length > 0) {
      for (const issue of lane.issues) {
        console.log(`  issue: ${issue}`);
      }
    }
    if (lane.warnings.length > 0) {
      for (const warning of lane.warnings) {
        console.log(`  warning: ${warning}`);
      }
    }
  }

  if (report.issues.length === 0 && report.warnings.length === 0) {
    console.log("\nDoctor check passed.");
  }

  return report.ok ? 0 : 1;
}

async function runNewLaneCommand(context: CommandContext, options: NewLaneOptions): Promise<number> {
  if (!options.id) {
    throw new Error("missing required flag: --id");
  }
  if (!options.repo) {
    throw new Error("missing required flag: --repo");
  }

  const laneId = options.id;
  const paths = getDefaultLanePaths();
  await ensureLaneHome(paths);
  const lanes = await loadLaneRegistry(paths);
  const title = options.title ?? laneId;
  const sessionName = options.sessionName ?? laneId;
  const priority = options.priority === undefined ? null : parseLanePriority(options.priority);
  const status = options.status === undefined ? "active" : parseLaneStatus(options.status);
  const tags = parseTagsOption(options.tags);

  const result = createLane(lanes, {
    id: laneId,
    title,
    repoPath: options.repo,
    jjBookmark: options.bookmark ?? null,
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
  await ensureLaneContextExists(paths, createdLane);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "lane.new", lane: createdLane});
  } else {
    console.log(`Created lane ${laneId}`);
  }
  return 0;
}

async function runListCommand(context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
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
    console.log(`${summary.id}  ${summary.stateLabel}  open=${summary.todoCounts.open}  proposed=${summary.todoCounts.proposed}`);
  }

  return 0;
}

async function runShowCommand(laneId: string, context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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
  const paths = getDefaultLanePaths();
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

async function runContextShowCommand(laneId: string, context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  await ensureLaneContextExists(paths, lane);
  const text = (await readLaneContext(paths, laneId)) ?? "";
  const contextPath = getLaneContextPath(paths, laneId);

  if (context.outputMode === "json") {
    printJson({ok: true, laneId, contextPath, text});
  } else {
    process.stdout.write(text.length > 0 ? text : `${contextPath}\n`);
  }
  return 0;
}

async function runContextEditCommand(laneId: string, context: CommandContext, options: ContextEditOptions): Promise<number> {
  const paths = getDefaultLanePaths();
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  await ensureLaneContextExists(paths, lane);
  const contextPath = getLaneContextPath(paths, laneId);

  if (options.text !== undefined) {
    await writeTextFile(contextPath, options.text.endsWith("\n") ? options.text : `${options.text}\n`);
    if (context.outputMode === "json") {
      printJson({ok: true, action: "context.edit", laneId, contextPath, mode: "write"});
    } else {
      console.log(`Updated context for ${laneId}`);
    }
    return 0;
  }

  const editorCommand = options.editor ?? process.env.VISUAL ?? process.env.EDITOR;
  if (!editorCommand) {
    throw new Error("no editor configured; set VISUAL or EDITOR, or pass --editor or --text");
  }

  const result = spawnSync(editorCommand, [contextPath], {stdio: "inherit", shell: true});
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`editor exited with status ${String(result.status ?? 1)}`);
  }

  if (context.outputMode === "json") {
    printJson({ok: true, action: "context.edit", laneId, contextPath, mode: "editor", editor: editorCommand});
  }
  return 0;
}

async function loadRuntimeCommandState(laneId: string): Promise<{
  readonly paths: ReturnType<typeof getDefaultLanePaths>;
  readonly runtimeState: LaneRuntimeState;
  readonly todoFile: LaneTodoFile;
}> {
  const paths = getDefaultLanePaths();
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
    repoPath: lane.repoPath,
    sessionName: lane.sessionName,
    jjBookmark: lane.jjBookmark,
    isActive: runtimeState?.isActive ?? false,
    stateLabel: runtimeState?.isActive ? runtimeState.mode : "cold",
    currentTodoId: runtimeState?.currentTodoId ?? null,
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

async function ensureLaneContextExists(paths: ReturnType<typeof getDefaultLanePaths>, lane: Lane): Promise<void> {
  const contextPath = getLaneContextPath(paths, lane.id);
  if (existsSync(contextPath)) {
    return;
  }
  const template = `# ${lane.id}\n\nPurpose:\n- Describe what this lane is for.\n\nConstraints:\n- Add lane-specific rules, references, or reminders here.\n\nReferences:\n- Add useful links, files, or commands.\n`;
  await writeTextFile(contextPath, template);
}

async function readLaneContext(paths: ReturnType<typeof getDefaultLanePaths>, laneId: string): Promise<string | null> {
  const contextPath = getLaneContextPath(paths, laneId);
  if (!existsSync(contextPath)) {
    return null;
  }
  const text = await readTextFile(contextPath);
  return text.trim().length > 0 ? text : null;
}

function getToolRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  void main(process.argv).then(exitCode => {
    process.exitCode = exitCode;
  });
}
