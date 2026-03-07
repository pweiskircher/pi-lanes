import type {LaneMessage, LaneSnapshot, LaneTodo} from "./types";

export type LaneTab = "chat" | "todos" | "settings" | "events";

export type LaneUiState = {
  readonly activeTab: LaneTab;
  readonly messageText: string;
  readonly messageMode: "steer" | "followUp";
  readonly contextText: string;
};

export type TodoDraft = {
  readonly title: string;
  readonly priority: string;
  readonly notes: string;
};

export type TodoGroups = {
  readonly proposed: ReadonlyArray<LaneTodo>;
  readonly open: ReadonlyArray<LaneTodo>;
  readonly inProgress: ReadonlyArray<LaneTodo>;
  readonly blocked: ReadonlyArray<LaneTodo>;
  readonly done: ReadonlyArray<LaneTodo>;
  readonly dropped: ReadonlyArray<LaneTodo>;
};

export function shortRepo(value: string): string {
  const parts = value.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || value;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function createTodoDraftMap(todos: ReadonlyArray<LaneTodo>): Record<string, TodoDraft> {
  return Object.fromEntries(todos.map(todo => [todo.id, {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""}]));
}

export function mergeTodoDraftMap(current: Record<string, TodoDraft>, todos: ReadonlyArray<LaneTodo>): Record<string, TodoDraft> {
  const next: Record<string, TodoDraft> = {};
  for (const todo of todos) {
    next[todo.id] = current[todo.id] ?? {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""};
  }
  return next;
}

export function createConversationKey(messages: ReadonlyArray<LaneMessage>): string {
  const lastMessage = messages[messages.length - 1] ?? null;
  if (lastMessage === null) {
    return "empty";
  }

  return `${messages.length}:${lastMessage.role}:${lastMessage.timestamp ?? "none"}:${lastMessage.content}`;
}

export function isScrolledNearBottom(element: HTMLDivElement): boolean {
  const remainingDistance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remainingDistance <= 24;
}

export function groupTodosByStatus(todos: ReadonlyArray<LaneTodo>): TodoGroups {
  return {
    proposed: todos.filter(todo => todo.status === "proposed"),
    open: todos.filter(todo => todo.status === "open"),
    inProgress: todos.filter(todo => todo.status === "in_progress"),
    blocked: todos.filter(todo => todo.status === "blocked"),
    done: todos.filter(todo => todo.status === "done"),
    dropped: todos.filter(todo => todo.status === "dropped"),
  };
}

export function getReviewTodoCount(lane: LaneSnapshot): number {
  return lane.todoCounts.open + lane.todoCounts.inProgress + lane.todoCounts.proposed + lane.todoCounts.blocked;
}
