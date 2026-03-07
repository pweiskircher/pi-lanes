import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createProposedTodo } from "../src/functional-core/todo-transitions.js";
import {
  createStartedRuntimeState,
  createStoppedRuntimeState,
  setRuntimeCurrentTodo,
  setRuntimePendingQuestion,
  setRuntimeSummary,
} from "../src/functional-core/runtime-state.js";
import {
  getDefaultLanePaths,
  loadLaneRegistry,
  loadLaneRuntimeState,
  loadLaneTodoFile,
  saveLaneRuntimeState,
  saveLaneTodoFile,
} from "../src/imperative-shell/lane-store.js";
import type { Lane, LaneTodo, TodoPriority } from "../src/types.js";

const todoPriorities = new Set<TodoPriority>(["low", "medium", "high"]);

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const lane = await findCurrentLane();
    if (!lane) {
      return;
    }

    pi.setSessionName(lane.sessionName);
    ctx.ui.notify(`lane: ${lane.id}`, "info");
  });

  pi.registerCommand("lane-status", {
    description: "Show the current lane summary",
    handler: async (_args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current workspace", "warning");
        return;
      }

      const paths = getLanePaths();
      const todoFile = await loadLaneTodoFile(paths, lane.id);
      const runtimeState = await loadOrCreateRuntimeState(lane);
      const openCount = todoFile.todos.filter(todo => todo.status === "open").length;
      const proposedCount = todoFile.todos.filter(todo => todo.status === "proposed").length;
      const text = [
        `Lane: ${lane.id}`,
        `Title: ${lane.title}`,
        `Port: ${lane.port}`,
        `Bookmark: ${lane.jjBookmark}`,
        `Open TODOs: ${openCount}`,
        `Proposed TODOs: ${proposedCount}`,
        runtimeState.currentSummary ? `Summary: ${runtimeState.currentSummary}` : null,
        runtimeState.pendingQuestion ? `Needs input: ${runtimeState.pendingQuestion}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      pi.sendMessage({
        customType: "lane-status",
        content: text,
        display: true,
        details: { laneId: lane.id },
      });
    },
  });

  pi.registerCommand("lane-todos", {
    description: "Show current lane TODOs",
    handler: async (_args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current workspace", "warning");
        return;
      }

      const todoFile = await loadLaneTodoFile(getLanePaths(), lane.id);
      const text = formatTodos(todoFile.todos);
      pi.sendMessage({
        customType: "lane-todos",
        content: text,
        display: true,
        details: { laneId: lane.id },
      });
    },
  });

  pi.registerCommand("lane-set-summary", {
    description: "Set the current lane runtime summary",
    handler: async (args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current workspace", "warning");
        return;
      }

      const runtimeState = await loadOrCreateRuntimeState(lane);
      const updated = setRuntimeSummary(runtimeState, args.trim(), new Date().toISOString());
      await saveLaneRuntimeState(getLanePaths(), updated);
      ctx.ui.notify(`Updated lane summary for ${lane.id}`, "success");
    },
  });

  pi.registerCommand("lane-set-question", {
    description: "Set the current lane pending question",
    handler: async (args, ctx) => {
      const lane = await findCurrentLane();
      if (!lane) {
        ctx.ui.notify("No lane matched the current workspace", "warning");
        return;
      }

      const runtimeState = await loadOrCreateRuntimeState(lane);
      const updated = setRuntimePendingQuestion(runtimeState, args.trim(), new Date().toISOString());
      await saveLaneRuntimeState(getLanePaths(), updated);
      ctx.ui.notify(`Updated pending question for ${lane.id}`, "success");
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
        ctx.ui.notify("No lane matched the current workspace", "warning");
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
      title: Type.String({ description: "Short actionable TODO title" }),
      priority: Type.Optional(Type.String({ description: "low, medium, or high" })),
      notes: Type.Optional(Type.String({ description: "Optional notes" })),
      proposalReason: Type.String({ description: "Why this TODO should exist" }),
    }),
    async execute(_toolCallId, params) {
      const lane = await findCurrentLane();
      if (!lane) {
        return {
          content: [{ type: "text", text: "No lane matched the current workspace." }],
          details: { ok: false },
        };
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
        return {
          content: [{ type: "text", text: result.issues.map(issue => issue.message).join("; ") }],
          details: { ok: false, issues: result.issues },
        };
      }

      await saveLaneTodoFile(paths, result.data);
      const todo = result.data.todos[result.data.todos.length - 1];
      return {
        content: [{ type: "text", text: `Proposed TODO ${todo?.id}: ${todo?.title}` }],
        details: { ok: true, laneId: lane.id, todo },
      };
    },
  });
}

function getLanePaths() {
  return getDefaultLanePaths(getLanesRoot());
}

function getLanesRoot(): string {
  const root = process.env.PI_LANES_ROOT;
  if (!root) {
    throw new Error("PI_LANES_ROOT is not set");
  }
  return root;
}

async function findCurrentLane(): Promise<Lane | null> {
  const lanes = await loadLaneRegistry(getLanePaths());
  const cwd = process.cwd();
  return lanes.find(lane => lane.workspacePath === cwd) ?? null;
}

async function loadOrCreateRuntimeState(lane: Lane) {
  const paths = getLanePaths();
  const existing = await loadLaneRuntimeState(paths, lane.id);
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const state = createStoppedRuntimeState(createStartedRuntimeState({ lane, existingRuntimeState: null, now }), now);
  await saveLaneRuntimeState(paths, state);
  return state;
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

function parseTodoPriority(input: unknown): TodoPriority {
  if (typeof input === "string" && todoPriorities.has(input as TodoPriority)) {
    return input as TodoPriority;
  }
  return "medium";
}

function formatTodos(todos: ReadonlyArray<LaneTodo>): string {
  if (todos.length === 0) {
    return "No TODOs.";
  }
  return todos.map(todo => `- ${todo.id} [${todo.status}] (${todo.priority}) ${todo.title}`).join("\n");
}
