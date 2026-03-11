import type {LaneMessage} from "./types";

export type LaneTab = "chat" | "settings" | "events";

export type LaneUiState = {
  readonly activeTab: LaneTab;
  readonly messageText: string;
  readonly messageMode: "steer" | "followUp";
  readonly contextText: string;
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
