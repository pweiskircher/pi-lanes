// pattern: Imperative Shell

import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {approveProposedTodo, createHumanTodo, deleteTodo, editTodo, rejectProposedTodo, setTodoStatus} from "../functional-core/todo-transitions.js";
import {
  getDefaultLanePaths,
  getLaneById,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneTodoFile,
} from "./lane-store.js";
import type {LaneTodo, TodoPriority, TodoStatus} from "../types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);
const todoStatuses = new Set<TodoStatus>(["open", "in_progress", "blocked", "done", "dropped"]);

export async function serveDashboard(options: {readonly rootPath: string; readonly port: number}): Promise<void> {
  const paths = getDefaultLanePaths(options.rootPath);
  const htmlPath = resolve(options.rootPath, "dashboard/index.html");

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (method === "GET" && url.pathname === "/") {
        const html = await readFile(htmlPath, "utf8");
        sendHtml(response, html);
        return;
      }

      if (method === "GET" && url.pathname === "/api/snapshot") {
        sendJson(response, 200, {ok: true, lanes: await buildSnapshot(paths)});
        return;
      }

      const laneMatch = url.pathname.match(/^\/api\/lanes\/([a-z0-9-]+)$/);
      if (method === "GET" && laneMatch) {
        const laneId = laneMatch[1] ?? "";
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
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
        const result = createHumanTodo(todoFile, {
          id: createNextTodoId(todoFile.todos),
          title,
          priority,
          notes,
          now,
        });
        if (!result.success) {
          throw new Error(result.issues.map(issue => issue.message).join("; "));
        }
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
        const result = editTodo(
          todoFile,
          todoId,
          {
            title: readOptionalString(body, "title"),
            notes: readOptionalString(body, "notes"),
            priority: body.priority === undefined ? null : parseTodoPriority(body.priority),
          },
          new Date().toISOString(),
        );
        if (!result.success) {
          throw new Error(result.issues.map(issue => issue.message).join("; "));
        }
        await saveLaneTodoFile(paths, result.data);
        sendJson(response, 200, {ok: true, lane: await buildLaneDetail(paths, laneId)});
        return;
      }

      if (todoMatch && method === "DELETE") {
        const laneId = todoMatch[1] ?? "";
        const todoId = todoMatch[2] ?? "";
        const todoFile = await loadLaneTodoFile(paths, laneId);
        const result = deleteTodo(todoFile, todoId);
        if (!result.success) {
          throw new Error(result.issues.map(issue => issue.message).join("; "));
        }
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

        if (!result.success) {
          throw new Error(result.issues.map(issue => issue.message).join("; "));
        }
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
  const runtimeState = await loadLaneRuntimeState(paths, laneId);
  return {
    lane,
    runtimeState,
    todos: todoFile.todos,
    groupedTodos: groupTodos(todoFile.todos),
    todoCounts: countTodos(todoFile.todos),
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing or invalid field: ${key}`);
  }
  return value;
}

function readOptionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`invalid field: ${key}`);
  }
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

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {"content-type": "application/json; charset=utf-8"});
  response.end(JSON.stringify(value, null, 2));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
  response.end(html);
}
