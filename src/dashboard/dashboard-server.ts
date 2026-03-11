// pattern: Imperative Shell

import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, resolve} from "node:path";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeMode,
} from "../runtime/runtime-state.js";
import {
  getDefaultLanePaths,
  getLaneById,
  getLaneContextPath,
  loadLaneEventLog,
  loadLaneRegistry,
  loadLaneRuntimeState,
  saveLaneRuntimeState,
} from "../storage/lane-store.js";
import {readTextFile, writeTextFile} from "../storage/json-files.js";
import {findLaneControlledSessionInSessions, listControlledSessions, type PiControlledSession} from "../pi/pi-session-control.js";
import type {
  DashboardMessageDeliveryMode,
  LaneHealth,
  LaneLiveOutputResponse,
  LaneResponse,
  LaneSnapshot,
  SnapshotResponse,
} from "./dashboard-contracts.js";
import type {Lane, LaneRuntimeState} from "../types.js";

const messageDeliveryModes = new Set<DashboardMessageDeliveryMode>(["steer", "followUp"]);
const CONTROLLED_SESSION_CACHE_TTL_MS = 1000;

type ControlledSessionCache = {
  readonly expiresAt: number;
  readonly sessions: ReadonlyArray<PiControlledSession>;
};

let controlledSessionCache: ControlledSessionCache | null = null;

export async function serveDashboard(options: {readonly configRootPath: string; readonly toolRootPath: string; readonly port: number}): Promise<void> {
  const paths = getDefaultLanePaths(options.configRootPath);
  const distDirectoryPath = resolve(options.toolRootPath, "dashboard/dist");
  const htmlPath = resolve(distDirectoryPath, "index.html");

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
        const assetPath = url.pathname === "/" ? htmlPath : resolve(distDirectoryPath, `.${url.pathname}`);
        try {
          const body = await readFile(assetPath);
          sendBytes(response, 200, body, getContentType(assetPath));
        } catch (error) {
          if (isFileNotFoundError(error) && url.pathname === "/") {
            sendHtml(response, "Dashboard frontend not built. Run: npm run dashboard:build");
            return;
          }
          throw error;
        }
        return;
      }

      if (method === "GET" && url.pathname === "/api/snapshot") {
        const payload: SnapshotResponse = {ok: true, lanes: await buildSnapshot(paths)};
        sendJson(response, 200, payload);
        return;
      }

      const laneMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)$/);
      if (method === "GET" && laneMatch) {
        const payload: LaneResponse = {ok: true, lane: await buildLaneDetail(paths, laneMatch[1] ?? "")};
        sendJson(response, 200, payload);
        return;
      }

      const runtimeMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/runtime$/);
      if (method === "PATCH" && runtimeMatch) {
        const laneId = runtimeMatch[1] ?? "";
        const body = await readJsonBody(request);
        const lane = getLaneById(await loadLaneRegistry(paths), laneId);
        let runtimeState = await loadOrCreateRuntimeState(paths, lane);
        const now = new Date().toISOString();

        if (Object.hasOwn(body, "mode")) {
          const modeResult = setRuntimeMode(runtimeState, readRequiredString(body, "mode"), now);
          if (!modeResult.success) throw new Error(modeResult.issues.map(issue => issue.message).join("; "));
          runtimeState = modeResult.data;
        }

        await saveLaneRuntimeState(paths, runtimeState);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      const contextMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/context$/);
      if (method === "PATCH" && contextMatch) {
        const laneId = contextMatch[1] ?? "";
        getLaneById(await loadLaneRegistry(paths), laneId);
        const body = await readJsonBody(request);
        const text = readString(body, "text");
        await writeTextFile(getLaneContextPath(paths, laneId), text.endsWith("\n") ? text : `${text}\n`);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      const messageMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/message$/);
      if (method === "POST" && messageMatch) {
        const laneId = messageMatch[1] ?? "";
        const body = await readJsonBody(request);
        const runtimeState = await loadLaneRuntimeState(paths, laneId);
        if (!runtimeState?.messageBridge) {
          throw new Error(`lane is not live-message enabled: ${laneId}`);
        }

        const message = readRequiredString(body, "message");
        const deliverAs = parseMessageDeliveryMode(body.deliverAs);
        const bridgeResponse = await fetch(`http://127.0.0.1:${runtimeState.messageBridge.port}/message`, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({message, deliverAs, authToken: runtimeState.messageBridge.authToken}),
        });
        const bridgeJson = (await bridgeResponse.json()) as Record<string, unknown>;
        if (!bridgeResponse.ok || bridgeJson.ok !== true) {
          throw new Error(typeof bridgeJson.error === "string" ? bridgeJson.error : `bridge request failed: ${bridgeResponse.status}`);
        }

        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId), delivery: bridgeJson});
        return;
      }

      const liveOutputMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/live-output$/);
      if (method === "GET" && liveOutputMatch) {
        const laneId = liveOutputMatch[1] ?? "";
        const runtimeState = await loadLaneRuntimeState(paths, laneId);
        if (!runtimeState?.messageBridge) {
          const payload: LaneLiveOutputResponse = {ok: true, liveOutput: null};
          sendJson(response, 200, payload);
          return;
        }

        const bridgeResponse = await fetch(`http://127.0.0.1:${runtimeState.messageBridge.port}/live-output`, {
          headers: {authorization: `Bearer ${runtimeState.messageBridge.authToken}`},
        });
        const bridgeJson = (await bridgeResponse.json()) as Record<string, unknown>;
        if (!bridgeResponse.ok || bridgeJson.ok !== true) {
          throw new Error(typeof bridgeJson.error === "string" ? bridgeJson.error : `bridge request failed: ${bridgeResponse.status}`);
        }

        const payload: LaneLiveOutputResponse = {
          ok: true,
          liveOutput: bridgeJson.liveOutput !== null && typeof bridgeJson.liveOutput === "object" && !Array.isArray(bridgeJson.liveOutput)
            ? bridgeJson.liveOutput as LaneLiveOutputResponse["liveOutput"]
            : null,
        };
        sendJson(response, 200, payload);
        return;
      }

      sendJson(response, 404, {ok: false, error: `Not found: ${method} ${url.pathname}`});
    } catch (error) {
      sendJson(response, 400, {ok: false, error: error instanceof Error ? error.message : String(error)});
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolvePromise());
  });

  console.log(`Dashboard listening on http://127.0.0.1:${options.port}`);
}

async function buildSnapshot(paths: ReturnType<typeof getDefaultLanePaths>): Promise<ReadonlyArray<LaneSnapshot>> {
  const lanes = await loadLaneRegistry(paths);
  const sessions = await loadControlledSessionsCached();
  return await Promise.all(lanes.map(async lane => await buildLaneDetailFromLane(paths, lane, sessions)));
}

async function buildLaneDetail(paths: ReturnType<typeof getDefaultLanePaths>, laneId: string): Promise<LaneSnapshot> {
  const lanes = await loadLaneRegistry(paths);
  const lane = getLaneById(lanes, laneId);
  return await buildLaneDetailFromLane(paths, lane, await loadControlledSessionsCached());
}

async function buildLaneDetailFromLane(
  paths: ReturnType<typeof getDefaultLanePaths>,
  lane: Lane,
  controlledSessions: ReadonlyArray<PiControlledSession>,
): Promise<LaneSnapshot> {
  const runtimeState = await loadOrCreateRuntimeState(paths, lane);
  const contextText = await readLaneContextText(paths, lane.id);
  const eventLog = await loadLaneEventLog(paths, lane.id);
  const liveSession = await findLaneControlledSessionInSessions(lane, controlledSessions);
  const liveSessionHealth = await readLiveSessionHealth(runtimeState, liveSession);
  return {
    lane,
    runtimeState,
    liveSession,
    liveSessionHealth,
    contextText,
    recentEvents: eventLog.events.slice().reverse(),
  };
}

async function loadOrCreateRuntimeState(paths: ReturnType<typeof getDefaultLanePaths>, lane: Lane): Promise<LaneRuntimeState> {
  return (await loadLaneRuntimeState(paths, lane.id)) ?? createDefaultRuntimeState(lane);
}

async function loadControlledSessionsCached(nowMs = Date.now()): Promise<ReadonlyArray<PiControlledSession>> {
  if (controlledSessionCache && controlledSessionCache.expiresAt > nowMs) {
    return controlledSessionCache.sessions;
  }

  const sessions = await listControlledSessions();
  controlledSessionCache = {
    expiresAt: nowMs + CONTROLLED_SESSION_CACHE_TTL_MS,
    sessions,
  };
  return sessions;
}

async function readLaneContextText(paths: ReturnType<typeof getDefaultLanePaths>, laneId: string): Promise<string> {
  const contextPath = getLaneContextPath(paths, laneId);
  try {
    return await readTextFile(contextPath);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return "";
    }
    throw error;
  }
}

async function readLiveSessionHealth(
  runtimeState: LaneRuntimeState,
  liveSession: PiControlledSession | null,
): Promise<LaneHealth> {
  if (runtimeState.messageBridge) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 500);
    try {
      const response = await fetch(`http://127.0.0.1:${runtimeState.messageBridge.port}/health`, {
        headers: {authorization: `Bearer ${runtimeState.messageBridge.authToken}`},
        signal: abortController.signal,
      });
      if (response.ok) {
        const json = (await response.json()) as Record<string, unknown>;
        return {
          ok: json.ok === true,
          isIdle: json.isIdle !== false,
          lastActivityAt: typeof json.lastActivityAt === "string" ? json.lastActivityAt : null,
          lastEventSummary: typeof json.lastEventSummary === "string" ? json.lastEventSummary : null,
        };
      }
    } catch {
      // Fall through to session-file-derived health.
    } finally {
      clearTimeout(timeout);
    }
  }

  if (liveSession === null || liveSession.isIdle === null) {
    return {
      ok: false,
      isIdle: true,
      lastActivityAt: liveSession?.recentMessages[liveSession.recentMessages.length - 1]?.timestamp ?? null,
      lastEventSummary: null,
    };
  }

  return {
    ok: true,
    isIdle: liveSession.isIdle !== false,
    lastActivityAt: liveSession.recentMessages[liveSession.recentMessages.length - 1]?.timestamp ?? null,
    lastEventSummary: liveSession.lastAssistant ?? liveSession.lastUser ?? null,
  };
}

function createDefaultRuntimeState(lane: Lane) {
  const now = new Date().toISOString();
  return createStoppedRuntimeState(createStartedRuntimeState({lane, existingRuntimeState: null, now}), now);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing or invalid field: ${key}`);
  }
  return value;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new Error(`missing or invalid field: ${key}`);
  }
  return value;
}

function parseMessageDeliveryMode(input: unknown): DashboardMessageDeliveryMode {
  if (typeof input !== "string" || !messageDeliveryModes.has(input as DashboardMessageDeliveryMode)) {
    return "followUp";
  }
  return input as DashboardMessageDeliveryMode;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {"content-type": "application/json; charset=utf-8"});
  response.end(JSON.stringify(value, null, 2));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
  response.end(html);
}

function sendBytes(response: ServerResponse, statusCode: number, body: Buffer, contentType: string): void {
  response.writeHead(statusCode, {"content-type": contentType, "content-length": body.byteLength});
  response.end(body);
}

function getContentType(path: string): string {
  const extension = extname(path);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
