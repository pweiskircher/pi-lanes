import {createServer, type IncomingMessage, type Server, type ServerResponse} from "node:http";
import {randomUUID} from "node:crypto";
import type {ExtensionAPI, ExtensionContext} from "@mariozechner/pi-coding-agent";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeMessageBridge,
} from "../src/runtime/runtime-state.js";
import {
  getDefaultLanePaths,
  loadLaneEventLog,
  loadLaneRegistry,
  loadLaneRuntimeState,
  saveLaneEventLog,
  saveLaneRuntimeState,
} from "../src/storage/lane-store.js";
import type {Lane, LaneEvent, LaneEventKind, LaneRuntimeState} from "../src/types.js";

let activeMessageBridge: {readonly laneId: string; readonly port: number; readonly authToken: string; readonly server: Server} | null = null;
let liveSessionHealth: {
  readonly laneId: string;
  readonly isIdle: boolean;
  readonly lastActivityAt: string;
  readonly lastEventSummary: string;
} | null = null;
let liveAssistantOutput: {
  readonly laneId: string;
  readonly isStreaming: boolean;
  readonly role: "assistant";
  readonly content: string;
  readonly updatedAt: string;
} | null = null;
const laneEventAppendQueues = new Map<string, Promise<void>>();

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const lane = await findCurrentLane();
    if (!lane) {
      updateLaneStatus(ctx, null);
      return;
    }
    pi.setSessionName(lane.sessionName);
    setLiveSessionHealth(lane.id, true, `session started in ${lane.repoPath}`);
    await appendLaneEvent(lane.id, "session_start", "Session started", lane.repoPath);
    await ensureMessageBridge(pi, lane);
    const runtimeState = await loadOrCreateRuntimeState(lane);
    updateLaneStatus(ctx, lane);
    ctx.ui.notify(`lane: ${lane.id}`, "info");
    await saveLaneRuntimeState(getLanePaths(), runtimeState);
  });

  pi.on("session_switch", async (_event, ctx) => {
    const lane = await findCurrentLane();
    updateLaneStatus(ctx, lane);
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
    clearLiveAssistantOutput(lane.id);
    await appendLaneEvent(lane.id, "agent_start", "Agent turn started", null);
  });

  pi.on("message_start", async event => {
    const lane = await findCurrentLane();
    if (!lane) return;
    if (readMessageRole(event.message) !== "assistant") return;
    setLiveAssistantOutput(lane.id, true, readAssistantMessageText(event.message) ?? "");
  });

  pi.on("message_update", async event => {
    const lane = await findCurrentLane();
    if (!lane) return;
    if (readMessageRole(event.message) !== "assistant") return;
    const content = readAssistantMessageText(event.message);
    if (content === null) return;
    setLiveAssistantOutput(lane.id, true, content);
  });

  pi.on("message_end", async event => {
    const lane = await findCurrentLane();
    if (!lane) return;
    if (readMessageRole(event.message) !== "assistant") return;
    const content = readAssistantMessageText(event.message);
    if (content === null) {
      clearLiveAssistantOutput(lane.id);
      return;
    }
    setLiveAssistantOutput(lane.id, false, content);
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
    clearLiveAssistantOutput(lane.id);
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
      const runtimeState = await loadOrCreateRuntimeState(lane);
      const text = [
        `Lane: ${lane.id}`,
        `Title: ${lane.title}`,
        `Repo: ${lane.repoPath}`,
        `Bookmark: ${lane.jjBookmark ?? "—"}`,
        `Mode: ${runtimeState.mode}`,
        runtimeState.messageBridge ? `Dashboard bridge: 127.0.0.1:${runtimeState.messageBridge.port}` : null,
        liveSessionHealth?.laneId === lane.id ? `Health: ${liveSessionHealth.isIdle ? "idle" : "busy"}` : null,
      ].filter(Boolean).join("\n");
      pi.sendMessage({customType: "lane-status", content: text, display: true, details: {laneId: lane.id}}, {triggerTurn: false});
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

        if (method === "GET" && url.pathname === "/live-output") {
          const authorization = request.headers.authorization;
          if (authorization !== `Bearer ${authToken}`) {
            sendJson(response, 403, {ok: false, error: "invalid auth token"});
            return;
          }
          sendJson(response, 200, {
            ok: true,
            liveOutput: liveAssistantOutput?.laneId === lane.id && liveAssistantOutput.isStreaming ? liveAssistantOutput : null,
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

function updateLaneStatus(ctx: ExtensionContext, lane: Lane | null): void {
  ctx.ui.setStatus("lane", undefined);

  if (!lane) {
    ctx.ui.setWidget("lane-banner", undefined);
    return;
  }

  ctx.ui.setWidget("lane-banner", (_tui, widgetTheme) => {
    const content = `${widgetTheme.fg("muted", "Lane: ")}${widgetTheme.fg("accent", widgetTheme.bold(lane.id))}`;
    return {
      invalidate() {},
      render(_width: number): string[] {
        return [content];
      },
    };
  });
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
  liveAssistantOutput = null;
}

async function findLaneById(laneId: string): Promise<Lane | null> {
  const lanes = await loadLaneRegistry(getLanePaths());
  return lanes.find(lane => lane.id === laneId) ?? null;
}

async function appendLaneEvent(laneId: string, kind: LaneEventKind, summary: string, details: string | null): Promise<void> {
  const previous = laneEventAppendQueues.get(laneId) ?? Promise.resolve();
  const next = previous.then(async () => {
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
  });

  laneEventAppendQueues.set(laneId, next.catch(() => undefined));
  await next;
}

function setLiveSessionHealth(laneId: string, isIdle: boolean, lastEventSummary: string): void {
  liveSessionHealth = {
    laneId,
    isIdle,
    lastActivityAt: new Date().toISOString(),
    lastEventSummary,
  };
}

function setLiveAssistantOutput(laneId: string, isStreaming: boolean, content: string): void {
  liveAssistantOutput = {
    laneId,
    isStreaming,
    role: "assistant",
    content,
    updatedAt: new Date().toISOString(),
  };
}

function clearLiveAssistantOutput(laneId: string): void {
  if (liveAssistantOutput?.laneId === laneId) {
    liveAssistantOutput = null;
  }
}

function readMessageRole(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  return "role" in message && typeof (message as {readonly role?: unknown}).role === "string"
    ? ((message as {readonly role: string}).role)
    : null;
}

function readAssistantMessageText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = "content" in message ? (message as {readonly content?: unknown}).content : null;
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter(part => part && typeof part === "object" && "type" in part && (part as {readonly type: unknown}).type === "text")
    .map(part => (part as {readonly text?: unknown}).text)
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
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
