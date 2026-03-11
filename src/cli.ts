// pattern: Imperative Shell

import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createInterface} from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {Command} from "commander";
import {createLane} from "./lanes/lane-registry-transitions.js";
import {formatInitialLaneContext, needsLaneOnboarding} from "./lanes/lane-context.js";
import {buildDoctorLaneReport, buildDoctorReport} from "./lanes/doctor.js";
import {formatLaneBriefing} from "./lanes/lane-briefing.js";
import {formatLaneStartupPrompt} from "./lanes/lane-startup-prompt.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeMode,
} from "./runtime/runtime-state.js";
import {
  assertRepoExists,
  deleteLaneFiles,
  ensureLaneHome,
  getDefaultLanePaths,
  getLaneById,
  getLaneContextPath,
  getLaneRuntimePath,
  loadLaneRegistry,
  loadLaneRuntimeState,
  saveLaneRegistry,
  saveLaneRuntimeState,
} from "./storage/lane-store.js";
import {readTextFile, writeTextFile} from "./storage/json-files.js";
import {serveDashboard} from "./dashboard/dashboard-server.js";
import {ensurePiExists, launchPi} from "./pi/pi-launch.js";
import {hasSavedPiSessionForCwd} from "./pi/pi-session-discovery.js";
import type {
  Lane,
  LanePriority,
  LaneRuntimeMode,
  LaneRuntimeState,
  LaneStatus,
} from "./types.js";

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
  readonly continue?: boolean;
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

type DeleteLaneOptions = JsonOption & {
  readonly yes?: boolean;
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
    .command("delete")
    .argument("<laneId>")
    .description("Delete a lane and all of its lane files")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: DeleteLaneOptions) => {
      await runWithHandling(() => runDeleteLaneCommand(laneId, createCommandContext(options), options));
    });

  program
    .command("start")
    .argument("<laneId>")
    .description("Start a lane")
    .option("-c, --continue", "Continue an existing saved pi session for the lane repo if available")
    .option("--dry-run", "Update runtime state but do not launch pi")
    .option("--json", "Output JSON")
    .action(async (laneId: string, options: StartOptions) => {
      await runWithHandling(() => runStartCommand(laneId, createCommandContext(options), options));
    });

  program
    .command("new")
    .argument("[laneId]")
    .description("Create a new lane")
    .option("--id <id>", "Lane id (legacy alternative to the positional laneId)")
    .option("--repo <repo>", "Repository root path (defaults to the current working directory)")
    .option("--title <title>", "Lane title")
    .option("--bookmark <bookmark>", "jj bookmark")
    .option("--session-name <sessionName>", "pi session name")
    .option("--server-command <serverCommand>", "Dev server command")
    .option("--priority <priority>", "Lane priority")
    .option("--status <status>", "Lane status")
    .option("--notes <notes>", "Lane notes")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output JSON")
    .action(async (laneId: string | undefined, options: NewLaneOptions) => {
      await runWithHandling(() => runNewLaneCommand(createCommandContext(options), laneId, options));
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

  const existingRuntimeState = await loadLaneRuntimeState(paths, lane.id);
  const now = toIsoNow();
  const runtimeState = createStartedRuntimeState({lane, existingRuntimeState, now});

  await saveLaneRuntimeState(paths, runtimeState);

  const briefing = buildLaneDetail(lane, runtimeState);
  if (context.outputMode === "json") {
    printJson({ok: true, action: "start", lane: briefing, dryRun});
  } else {
    console.log(formatLaneBriefing({lane, runtimeState}));
    console.log("");
  }

  if (dryRun) {
    if (context.outputMode === "text") {
      console.log("Dry run only. Runtime state updated, but pi was not launched.");
    }
    return 0;
  }

  await ensurePiExists();
  const continueSession = options.continue === true && (await hasSavedPiSessionForCwd(lane.repoPath));
  const laneContext = await readLaneContext(paths, lane.id);
  const onboardingNeeded = needsLaneOnboarding({lane, laneContext});
  const initialMessages = continueSession
    ? []
    : [formatLaneStartupPrompt({lane, runtimeState, laneContext, needsOnboarding: onboardingNeeded})];
  const toolRoot = getToolRoot();
  const exitCode = await launchPi({
    cwd: lane.repoPath,
    continueSession,
    initialMessages,
    extensionPaths: [resolve(toolRoot, "extensions/lane-bridge.ts")],
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
    lanes.map(async lane => buildLaneDetail(lane, await loadLaneRuntimeState(paths, lane.id))),
  );

  if (context.outputMode === "json") {
    printJson({ok: true, generatedAt: toIsoNow(), lanes: snapshot});
  } else {
    for (const lane of snapshot) {
      console.log(`${lane.id}  ${lane.stateLabel}`);
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
      const runtimePath = getLaneRuntimePath(paths, lane.id);
      const contextPath = getLaneContextPath(paths, lane.id);
      const repoExists = existsSync(lane.repoPath);
      const runtimeFileExists = existsSync(runtimePath);
      const contextFileExists = existsSync(contextPath);
      const runtimeState = await loadLaneRuntimeState(paths, lane.id);

      return buildDoctorLaneReport({
        lane,
        repoExists,
        runtimeFileExists,
        contextFileExists,
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

async function runNewLaneCommand(context: CommandContext, laneIdArgument: string | undefined, options: NewLaneOptions): Promise<number> {
  const laneId = laneIdArgument ?? options.id;
  if (!laneId) {
    throw new Error("missing lane id: pass <laneId> or --id");
  }

  const repoPath = resolve(options.repo ?? process.cwd());
  await assertRepoExists(repoPath);

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
    repoPath,
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

async function runDeleteLaneCommand(laneId: string, context: CommandContext, options: DeleteLaneOptions): Promise<number> {
  if (context.outputMode === "json" && options.yes !== true) {
    throw new Error("refusing to prompt in --json mode; pass --yes to confirm deletion");
  }

  const paths = getDefaultLanePaths();
  const lanes = await loadLaneRegistry(paths);
  const lane = getLaneById(lanes, laneId);
  const confirmed = options.yes === true || await confirmLaneDeletion(laneId);
  if (!confirmed) {
    if (context.outputMode === "json") {
      printJson({ok: true, action: "lane.delete", laneId, deleted: false});
    } else {
      console.log(`Skipped deleting lane ${laneId}`);
    }
    return 0;
  }

  await deleteLaneFiles(paths, laneId);
  await saveLaneRegistry(paths, lanes.filter(candidate => candidate.id !== laneId));

  if (context.outputMode === "json") {
    printJson({ok: true, action: "lane.delete", laneId, deleted: true, lane});
  } else {
    console.log(`Deleted lane ${laneId}`);
  }
  return 0;
}

async function runListCommand(context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
  const lanes = await loadLaneRegistry(paths);
  const summaries = await Promise.all(
    lanes.map(async lane => buildLaneSummary(lane, await loadLaneRuntimeState(paths, lane.id))),
  );

  if (context.outputMode === "json") {
    printJson({ok: true, lanes: summaries});
    return 0;
  }

  for (const summary of summaries) {
    console.log(`${summary.id}  ${summary.stateLabel}`);
  }

  return 0;
}

async function runShowCommand(laneId: string, context: CommandContext): Promise<number> {
  const paths = getDefaultLanePaths();
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const runtimeState = await loadLaneRuntimeState(paths, lane.id);
  const detail = buildLaneDetail(lane, runtimeState);

  if (context.outputMode === "json") {
    printJson({ok: true, lane: detail});
    return 0;
  }

  console.log(formatLaneBriefing({lane, runtimeState}));
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
}> {
  const paths = getDefaultLanePaths();
  const lane = getLaneById(await loadLaneRegistry(paths), laneId);
  const now = toIsoNow();
  const runtimeState =
    (await loadLaneRuntimeState(paths, laneId)) ?? createStoppedRuntimeState(createStartedRuntimeState({lane, existingRuntimeState: null, now}), now);
  return {paths, runtimeState};
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

function buildLaneSummary(lane: Lane, runtimeState: LaneRuntimeState | null) {
  return {
    id: lane.id,
    title: lane.title,
    repoPath: lane.repoPath,
    sessionName: lane.sessionName,
    jjBookmark: lane.jjBookmark,
    isActive: runtimeState?.isActive ?? false,
    stateLabel: runtimeState?.isActive ? runtimeState.mode : "cold",
  };
}

function buildLaneDetail(lane: Lane, runtimeState: LaneRuntimeState | null) {
  return {
    ...buildLaneSummary(lane, runtimeState),
    lane,
    runtimeState,
  };
}

function mustFindLane(lanes: ReadonlyArray<Lane>, laneId: string): Lane {
  const lane = lanes.find(candidate => candidate.id === laneId);
  if (!lane) {
    throw new Error(`lane not found after operation: ${laneId}`);
  }
  return lane;
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
  await writeTextFile(contextPath, formatInitialLaneContext(lane));
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

async function confirmLaneDeletion(laneId: string): Promise<boolean> {
  const readline = createInterface({input, output});
  try {
    const answer = await readline.question(`Delete lane ${laneId} and all of its lane files? [y/N] `);
    const normalizedAnswer = answer.trim().toLowerCase();
    return normalizedAnswer === "y" || normalizedAnswer === "yes";
  } finally {
    readline.close();
  }
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
