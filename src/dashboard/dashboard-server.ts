// pattern: Imperative Shell

import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {extname, resolve} from "node:path";
import {approveProposedTodo, createHumanTodo, deleteTodo, editTodo, rejectProposedTodo, setTodoStatus} from "../todos/todo-transitions.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimeMode,
} from "../runtime/runtime-state.js";
import {
  getDefaultLanePaths,
  getLaneById,
  getLaneContextPath,
  loadLaneEventLog,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "../storage/lane-store.js";
import {readTextFile, writeTextFile} from "../storage/json-files.js";
import {findLaneControlledSession} from "../pi/pi-session-control.js";
import type {Lane, LaneRuntimeState, LaneTodo, TodoPriority, TodoStatus} from "../types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);
const todoStatuses = new Set<TodoStatus>(["open", "in_progress", "blocked", "done", "dropped"]);
const messageDeliveryModes = new Set(["steer", "followUp"]);

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
        sendJson(response, 200, {ok: true, lanes: await buildSnapshot(paths)});
        return;
      }

      const laneMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)$/);
      if (method === "GET" && laneMatch) {
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneMatch[1] ?? "")});
        return;
      }

      const runtimeMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/runtime$/);
      if (method === "PATCH" && runtimeMatch) {
        const laneId = runtimeMatch[1] ?? "";
        const body = await readJsonBody(request);
        const lane = getLaneById(await loadLaneRegistry(paths), laneId);
        const todoFile = await loadLaneTodoFile(paths, laneId);
        let runtimeState = await loadOrCreateRuntimeState(paths, lane);
        const now = new Date().toISOString();

        if (Object.hasOwn(body, "mode")) {
          const modeResult = setRuntimeMode(runtimeState, readRequiredString(body, "mode"), now);
          if (!modeResult.success) throw new Error(modeResult.issues.map(issue => issue.message).join("; "));
          runtimeState = modeResult.data;
        }
        if (Object.hasOwn(body, "currentTodoId")) {
          const currentTodoResult = setRuntimeCurrentTodo(runtimeState, todoFile, readNullableString(body, "currentTodoId"), now);
          if (!currentTodoResult.success) throw new Error(currentTodoResult.issues.map(issue => issue.message).join("; "));
          runtimeState = currentTodoResult.data;
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
          sendJson(response, 200, {ok: true, liveOutput: null});
          return;
        }

        const bridgeResponse = await fetch(`http://127.0.0.1:${runtimeState.messageBridge.port}/live-output`, {
          headers: {authorization: `Bearer ${runtimeState.messageBridge.authToken}`},
        });
        const bridgeJson = (await bridgeResponse.json()) as Record<string, unknown>;
        if (!bridgeResponse.ok || bridgeJson.ok !== true) {
          throw new Error(typeof bridgeJson.error === "string" ? bridgeJson.error : `bridge request failed: ${bridgeResponse.status}`);
        }

        sendJson(response, 200, {
          ok: true,
          liveOutput: bridgeJson.liveOutput !== null && typeof bridgeJson.liveOutput === "object" && !Array.isArray(bridgeJson.liveOutput)
            ? bridgeJson.liveOutput
            : null,
        });
        return;
      }

      const createTodoMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/todos$/);
      if (method === "POST" && createTodoMatch) {
        const laneId = createTodoMatch[1] ?? "";
        const body = await readJsonBody(request);
        const title = readRequiredString(body, "title");
        const priority = parseTodoPriority(body.priority);
        const notes = readOptionalString(body, "notes");
        const todoFile = await loadLaneTodoFile(paths, laneId);
        const now = new Date().toISOString();
        const result = createHumanTodo(todoFile, {id: createNextTodoId(todoFile.todos), title, priority, notes, now});
        if (!result.success) throw new Error(result.issues.map(issue => issue.message).join("; "));
        await saveLaneTodoFile(paths, result.data);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      const todoMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/todos\/([a-z0-9-]+)$/);
      if (todoMatch && method === "PATCH") {
        const laneId = todoMatch[1] ?? "";
        const todoId = todoMatch[2] ?? "";
        const body = await readJsonBody(request);
        const todoFile = await loadLaneTodoFile(paths, laneId);
        const result = editTodo(todoFile, todoId, {
          title: readOptionalString(body, "title"),
          notes: readOptionalString(body, "notes"),
          priority: body.priority === undefined ? null : parseTodoPriority(body.priority),
        }, new Date().toISOString());
        if (!result.success) throw new Error(result.issues.map(issue => issue.message).join("; "));
        await saveLaneTodoFile(paths, result.data);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      if (todoMatch && method === "DELETE") {
        const laneId = todoMatch[1] ?? "";
        const todoId = todoMatch[2] ?? "";
        const todoFile = await loadLaneTodoFile(paths, laneId);
        const result = deleteTodo(todoFile, todoId);
        if (!result.success) throw new Error(result.issues.map(issue => issue.message).join("; "));
        await saveLaneTodoFile(paths, result.data);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      const actionMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)\/todos\/([a-z0-9-]+)\/(approve|reject|status)$/);
      if (actionMatch && method === "POST") {
        const laneId = actionMatch[1] ?? "";
        const todoId = actionMatch[2] ?? "";
        const action = actionMatch[3] ?? "";
        const todoFile = await loadLaneTodoFile(paths, laneId);
        const now = new Date().toISOString();
        const result =
          action === "approve"
            ? approveProposedTodo(todoFile, todoId, now)
            : action === "reject"
              ? rejectProposedTodo(todoFile, todoId, now)
              : setTodoStatus(todoFile, todoId, parseTodoStatus((await readJsonBody(request)).status), now);
        if (!result.success) throw new Error(result.issues.map(issue => issue.message).join("; "));
        await saveLaneTodoFile(paths, result.data);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
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

async function buildSnapshot(paths: ReturnType<typeof getDefaultLanePaths>) {
  const lanes = await loadLaneRegistry(paths);
  return await Promise.all(lanes.map(async lane => await buildLaneDetail(paths, lane.id)));
}

async function buildLaneDetail(paths: ReturnType<typeof getDefaultLanePaths>, laneId: string) {
  const lanes = await loadLaneRegistry(paths);
  const lane = getLaneById(lanes, laneId);
  const todoFile = await loadLaneTodoFile(paths, laneId);
  const runtimeState = await loadOrCreateRuntimeState(paths, lane);
  const contextText = await readLaneContextText(paths, laneId);
  const eventLog = await loadLaneEventLog(paths, laneId);
  const liveSession = await findLaneControlledSession(lane);
  const liveSessionHealth = await readLiveSessionHealth(runtimeState, liveSession);
  return {
    lane,
    runtimeState,
    liveSession,
    liveSessionHealth,
    contextText,
    recentEvents: eventLog.events.slice().reverse(),
    todos: todoFile.todos,
    groupedTodos: groupTodos(todoFile.todos),
    todoCounts: countTodos(todoFile.todos),
  };
}

async function loadOrCreateRuntimeState(paths: ReturnType<typeof getDefaultLanePaths>, lane: Lane): Promise<LaneRuntimeState> {
  return (await loadLaneRuntimeState(paths, lane.id)) ?? createDefaultRuntimeState(lane);
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
  liveSession: Awaited<ReturnType<typeof findLaneControlledSession>>,
): Promise<{
  readonly ok: boolean;
  readonly isIdle: boolean;
  readonly lastActivityAt: string | null;
  readonly lastEventSummary: string | null;
}> {
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

  return {
    ok: liveSession !== null,
    isIdle: liveSession?.isIdle !== false,
    lastActivityAt: liveSession?.recentMessages[liveSession.recentMessages.length - 1]?.timestamp ?? null,
    lastEventSummary: liveSession?.lastAssistant ?? liveSession?.lastUser ?? null,
  };
}

function countTodos(todos: ReadonlyArray<LaneTodo>) {
  return {
    proposed: todos.filter(todo => todo.status === "proposed").length,
    open: todos.filter(todo => todo.status === "open").length,
    inProgress: todos.filter(todo => todo.status === "in_progress").length,
    blocked: todos.filter(todo => todo.status === "blocked").length,
    done: todos.filter(todo => todo.status === "done").length,
    dropped: todos.filter(todo => todo.status === "dropped").length,
  };
}

function groupTodos(todos: ReadonlyArray<LaneTodo>) {
  return {
    proposed: todos.filter(todo => todo.status === "proposed"),
    open: todos.filter(todo => todo.status === "open"),
    inProgress: todos.filter(todo => todo.status === "in_progress"),
    blocked: todos.filter(todo => todo.status === "blocked"),
    done: todos.filter(todo => todo.status === "done"),
    dropped: todos.filter(todo => todo.status === "dropped"),
  };
}

function createDefaultRuntimeState(lane: Lane) {
  const now = new Date().toISOString();
  return createStoppedRuntimeState(createStartedRuntimeState({lane, existingRuntimeState: null, now}), now);
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

function readOptionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`invalid field: ${key}`);
  return value;
}

function readNullableString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`invalid field: ${key}`);
  return value;
}

function parseTodoPriority(input: unknown): TodoPriority {
  if (typeof input !== "string" || !todoPriorities.has(input as TodoPriority)) {
    return "medium";
  }
  return input as TodoPriority;
}

function parseTodoStatus(input: unknown): TodoStatus {
  if (typeof input !== "string" || !todoStatuses.has(input as TodoStatus)) {
    throw new Error(`invalid status: ${String(input)}`);
  }
  return input as TodoStatus;
}

function parseMessageDeliveryMode(input: unknown): "steer" | "followUp" {
  if (typeof input !== "string" || !messageDeliveryModes.has(input)) {
    return "followUp";
  }
  return input as "steer" | "followUp";
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
