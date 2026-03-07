import {createServer, type IncomingMessage, type Server, type ServerResponse} from "node:http";
import {randomUUID} from "node:crypto";
import type {ExtensionAPI} from "@mariozechner/pi-coding-agent";
import {Type} from "@sinclair/typebox";
import {createProposedTodo} from "../src/functional-core/todo-transitions.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimeLastHumanInstruction,
  setRuntimeMessageBridge,
  setRuntimeNeedsInput,
  setRuntimeSummary,
} from "../src/functional-core/runtime-state.js";
import {
  getDefaultLanePaths,
  loadLaneEventLog,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneEventLog,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "../src/imperative-shell/lane-store.js";
import type {Lane, LaneEvent, LaneEventKind, LaneRuntimeState, LaneTodo, TodoPriority} from "../src/types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);

let activeMessageBridge: {readonly laneId: string; readonly port: number; readonly authToken: string; readonly server: Server} | null = null;
let liveSessionHealth: {
  readonly laneId: string;
  readonly isIdle: boolean;
  readonly lastActivityAt: string;
  readonly lastEventSummary: string;
} | null = null;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const lane = await findCurrentLane();
    if (!lane) return;
    pi.setSessionName(lane.sessionName);
    setLiveSessionHealth(lane.id, true, `session started in ${lane.repoPath}`);
    await appendLaneEvent(lane.id, "session_start", "Session started", lane.repoPath);
    await ensureMessageBridge(pi, lane);
    ctx.ui.notify(`lane: ${lane.id}`, "info");
  });

  pi.on("input", async event => {
    const lane = await findCurrentLane();
    if (!lane) return;
    const summary = summarizeText(event.text, 120);
    setLiveSessionHealth(lane.id, false, `input: ${summary}`);
    await appendLaneEvent(lane.id, "input", `Input: ${summary}`, null);
  });

  pi.on("agent_start", async () => {
    const lane = await findCurrentLane();
    if (!lane) return;
    setLiveSessionHealth(lane.id, false, "Agent turn started");
    await appendLaneEvent(lane.id, "agent_start", "Agent turn started", null);
  });

  pi.on("turn_end", async event => {
    const lane = await findCurrentLane();
    if (!lane) return;
    const summary = summarizeTurnEnd(event.message);
    setLiveSessionHealth(lane.id, false, summary);
    await appendLaneEvent(lane.id, "turn_end", summary, null);
  });

  pi.on("agent_end", async () => {
    const lane = await findCurrentLane();
    if (!lane) return;
    setLiveSessionHealth(lane.id, true, "Agent is idle");
    await appendLaneEvent(lane.id, "agent_end", "Agent is idle", null);
  });

  pi.on("session_shutdown", async () => {
    const lane = await findCurrentLane();
    if (lane) {
      setLiveSessionHealth(lane.id, true, "Session shutting down");
      await appendLaneEvent(lane.id, "session_shutdown", "Session shutting down", null);
    }
    await shutdownMessageBridge();
  });

  pi.registerCommand("lane-status", {
    description: "Show the current lane summary",
    handler: async (_args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current session", "warning");
        return;
      }
      const paths = getLanePaths();
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      const runtimeState = await loadOrCreateRuntimeState(lane);
      const text = [
        `Lane: ${lane.id}`,
        `Title: ${lane.title}`,
        `Repo: ${lane.repoPath}`,
        `Bookmark: ${lane.jjBookmark ?? "—"}`,
        `Open TODOs: ${todoFile.todos.filter(todo => todo.status === "open").length}`,
        `Proposed TODOs: ${todoFile.todos.filter(todo => todo.status === "proposed").length}`,
        runtimeState.currentSummary ? `Summary: ${runtimeState.currentSummary}` : null,
        runtimeState.needsInput ? `Needs input: ${runtimeState.needsInput}` : null,
        runtimeState.messageBridge ? `Dashboard bridge: 127.0.0.1:${runtimeState.messageBridge.port}` : null,
        liveSessionHealth?.laneId === lane.id ? `Health: ${liveSessionHealth.isIdle ? "idle" : "busy"}` : null,
      ].filter(Boolean).join("\n");
      pi.sendMessage({customType: "lane-status", content: text, display: true, details: {laneId: lane.id}}, {triggerTurn: false});
    },
  });

  pi.registerCommand("lane-todos", {
    description: "Show current lane TODOs",
    handler: async (_args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current session", "warning");
        return;
      }
      const todoFile = await loadLaneTodoFile(getLanePaths(), lane.id);
      pi.sendMessage({customType: "lane-todos", content: formatTodos(todoFile.todos), display: true, details: {laneId: lane.id}}, {triggerTurn: false});
    },
  });

  pi.registerCommand("lane-set-summary", {
    description: "Set the current lane runtime summary",
    handler: async (args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current session", "warning");
        return;
      }
      const runtimeState = await loadOrCreateRuntimeState(lane);
      await saveLaneRuntimeState(getLanePaths(), setRuntimeSummary(runtimeState, args.trim(), new Date().toISOString()));
      ctx.ui.notify(`Updated lane summary for ${lane.id}`, "success");
    },
  });

  pi.registerCommand("lane-set-needs-input", {
    description: "Set the current lane needs-input text",
    handler: async (args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current session", "warning");
        return;
      }
      const runtimeState = await loadOrCreateRuntimeState(lane);
      await saveLaneRuntimeState(getLanePaths(), setRuntimeNeedsInput(runtimeState, args.trim(), new Date().toISOString()));
      ctx.ui.notify(`Updated needs-input for ${lane.id}`, "success");
    },
  });

  pi.registerCommand("lane-set-current-todo", {
    description: "Set the current lane TODO (usage: /lane-set-current-todo <todo-id>)",
    handler: async (args, ctx) => {
      const todoId = args.trim();
      if (!todoId) {
        ctx.ui.notify("Usage: /lane-set-current-todo <todo-id>", "warning");
        return;
      }
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current session", "warning");
        return;
      }
      const paths = getLanePaths();
      const runtimeState = await loadOrCreateRuntimeState(lane);
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      const result = setRuntimeCurrentTodo(runtimeState, todoFile, todoId, new Date().toISOString());
      if (!result.success) {
        ctx.ui.notify(result.issues.map(issue => issue.message).join("; "), "error");
        return;
      }
      await saveLaneRuntimeState(paths, result.data);
      ctx.ui.notify(`Set current TODO to ${todoId}`, "success");
    },
  });

  pi.registerTool({
    name: "lane_propose_todo",
    label: "Lane propose todo",
    description: "Propose a new lane-scoped TODO for human review. Use this to capture follow-up work without starting it.",
    parameters: Type.Object({
      title: Type.String({description: "Short actionable TODO title"}),
      priority: Type.Optional(Type.String({description: "low, medium, or high"})),
      notes: Type.Optional(Type.String({description: "Optional notes"})),
      proposalReason: Type.String({description: "Why this TODO should exist"}),
    }),
    async execute(_toolCallId, params) {
      const lane = await findCurrentLane();
      if (!lane) {
        return {content: [{type: "text", text: "No lane matched the current session."}], details: {ok: false}};
      }
      const priority = parseTodoPriority(params.priority);
      const paths = getLanePaths();
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      const now = new Date().toISOString();
      const result = createProposedTodo(todoFile, {
        id: createNextTodoId(todoFile.todos),
        title: params.title,
        priority,
        notes: typeof params.notes === "string" ? params.notes : null,
        proposalReason: params.proposalReason,
        now,
      });
      if (!result.success) {
        return {content: [{type: "text", text: result.issues.map(issue => issue.message).join("; ")}], details: {ok: false, issues: result.issues}};
      }
      await saveLaneTodoFile(paths, result.data);
      const todo = result.data.todos[result.data.todos.length - 1];
      await appendLaneEvent(lane.id, "todo_proposed", `Proposed TODO ${todo?.id ?? ""}: ${todo?.title ?? params.title}`, params.proposalReason);
      return {content: [{type: "text", text: `Proposed TODO ${todo?.id}: ${todo?.title}`}], details: {ok: true, laneId: lane.id, todo}};
    },
  });

  async function ensureMessageBridge(piApi: ExtensionAPI, lane: Lane): Promise<void> {
    if (activeMessageBridge?.laneId === lane.id) {
      return;
    }
    await shutdownMessageBridge();

    const authToken = randomUUID();
    const server = createServer(async (request, response) => {
      try {
        const method = request.method ?? "GET";
        const url = new URL(request.url ?? "/", "http://127.0.0.1");

        if (method === "GET" && url.pathname === "/health") {
          const authorization = request.headers.authorization;
          if (authorization !== `Bearer ${authToken}`) {
            sendJson(response, 403, {ok: false, error: "invalid auth token"});
            return;
          }
          sendJson(response, 200, {
            ok: true,
            laneId: lane.id,
            isIdle: liveSessionHealth?.laneId === lane.id ? liveSessionHealth.isIdle : true,
            lastActivityAt: liveSessionHealth?.laneId === lane.id ? liveSessionHealth.lastActivityAt : new Date().toISOString(),
            lastEventSummary: liveSessionHealth?.laneId === lane.id ? liveSessionHealth.lastEventSummary : "bridge online",
          });
          return;
        }

        if (method === "POST" && url.pathname === "/message") {
          const body = await readJsonBody(request);
          if (body.authToken !== authToken) {
            sendJson(response, 403, {ok: false, error: "invalid auth token"});
            return;
          }
          if (typeof body.message !== "string" || body.message.trim().length === 0) {
            sendJson(response, 400, {ok: false, error: "missing message"});
            return;
          }
          const deliverAs = body.deliverAs === "steer" ? "steer" : "followUp";
          const message = body.message.trim();
          piApi.sendUserMessage(message, {deliverAs});
          setLiveSessionHealth(lane.id, false, `dashboard ${deliverAs}: ${summarizeText(message, 120)}`);
          await appendLaneEvent(lane.id, "dashboard_message", `Dashboard ${deliverAs}: ${summarizeText(message, 120)}`, null);
          const runtimeState = await loadOrCreateRuntimeState(lane);
          await saveLaneRuntimeState(getLanePaths(), setRuntimeLastHumanInstruction(runtimeState, message, new Date().toISOString()));
          sendJson(response, 200, {ok: true, laneId: lane.id, deliverAs});
          return;
        }

        sendJson(response, 404, {ok: false, error: `Not found: ${method} ${url.pathname}`});
      } catch (error) {
        sendJson(response, 400, {ok: false, error: error instanceof Error ? error.message : String(error)});
      }
    });

    const port = await new Promise<number>((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("failed to determine bridge port"));
          return;
        }
        resolvePromise(address.port);
      });
    });

    activeMessageBridge = {laneId: lane.id, port, authToken, server};
    const runtimeState = await loadOrCreateRuntimeState(lane);
    await saveLaneRuntimeState(getLanePaths(), setRuntimeMessageBridge(runtimeState, {port, authToken}, new Date().toISOString()));
  }
}

function getLanePaths() {
  return getDefaultLanePaths(process.env.PI_LANES_HOME);
}

async function findCurrentLane(): Promise<Lane | null> {
  const lanes = await loadLaneRegistry(getLanePaths());
  const laneId = process.env.PI_LANE_ID;
  if (laneId) {
    return lanes.find(lane => lane.id === laneId) ?? null;
  }
  const cwd = process.cwd();
  const matches = lanes.filter(lane => lane.repoPath === cwd);
  return matches.length === 1 ? matches[0] ?? null : null;
}

async function loadOrCreateRuntimeState(lane: Lane): Promise<LaneRuntimeState> {
  const paths = getLanePaths();
  const existing = await loadLaneRuntimeState(paths, lane.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const state = createStoppedRuntimeState(createStartedRuntimeState({lane, existingRuntimeState: null, now}), now);
  await saveLaneRuntimeState(paths, state);
  return state;
}

async function shutdownMessageBridge(): Promise<void> {
  if (!activeMessageBridge) return;

  const bridge = activeMessageBridge;
  activeMessageBridge = null;
  await new Promise<void>((resolvePromise, reject) => {
    bridge.server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });

  const lane = await findLaneById(bridge.laneId);
  if (!lane) return;
  const runtimeState = await loadOrCreateRuntimeState(lane);
  await saveLaneRuntimeState(getLanePaths(), setRuntimeMessageBridge(runtimeState, null, new Date().toISOString()));
  liveSessionHealth = null;
}

async function findLaneById(laneId: string): Promise<Lane | null> {
  const lanes = await loadLaneRegistry(getLanePaths());
  return lanes.find(lane => lane.id === laneId) ?? null;
}

async function appendLaneEvent(laneId: string, kind: LaneEventKind, summary: string, details: string | null): Promise<void> {
  const paths = getLanePaths();
  const eventLog = await loadLaneEventLog(paths, laneId);
  const nextEvent: LaneEvent = {
    timestamp: new Date().toISOString(),
    kind,
    summary,
    details,
  };
  const events = [...eventLog.events, nextEvent].slice(-40);
  await saveLaneEventLog(paths, {laneId, events});
}

function setLiveSessionHealth(laneId: string, isIdle: boolean, lastEventSummary: string): void {
  liveSessionHealth = {
    laneId,
    isIdle,
    lastActivityAt: new Date().toISOString(),
    lastEventSummary,
  };
}

function summarizeText(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 1)}…`;
}

function summarizeTurnEnd(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "Turn ended";
  }
  const messageRecord = message as {readonly role?: unknown; readonly content?: unknown};
  const content = Array.isArray(messageRecord.content) ? messageRecord.content : [];
  const textParts = content
    .filter(part => part && typeof part === "object" && "type" in part && (part as {readonly type: unknown}).type === "text")
    .map(part => (part as {readonly text?: unknown}).text)
    .filter((part): part is string => typeof part === "string");
  if (textParts.length === 0) {
    return "Turn ended";
  }
  return `Assistant: ${summarizeText(textParts.join(" "), 120)}`;
}

function createNextTodoId(existingTodos: ReadonlyArray<LaneTodo>): string {
  let highestValue = 0;
  for (const todo of existingTodos) {
    const numericPart = Number.parseInt(todo.id.replace("todo-", ""), 10);
    if (!Number.isNaN(numericPart)) {
      highestValue = Math.max(highestValue, numericPart);
    }
  }
  return `todo-${String(highestValue + 1).padStart(3, "0")}`;
}

function parseTodoPriority(input: unknown): TodoPriority {
  if (typeof input === "string" && todoPriorities.has(input as TodoPriority)) {
    return input as TodoPriority;
  }
  return "medium";
}

function formatTodos(todos: ReadonlyArray<LaneTodo>): string {
  if (todos.length === 0) return "No TODOs.";
  return todos.map(todo => `- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`).join("\n");
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {"content-type": "application/json; charset=utf-8"});
  response.end(JSON.stringify(value, null, 2));
}
