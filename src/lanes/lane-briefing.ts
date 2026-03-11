// pattern: Functional Core

import type {Lane, LaneRuntimeState} from "../types.js";

export function formatLaneBriefing(options: {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState | null;
}): string {
  const {lane, runtimeState} = options;
  const lines = [
    `Lane: ${lane.id}`,
    `Title: ${lane.title}`,
    `Repo: ${lane.repoPath}`,
    `Session: ${lane.sessionName}`,
    `Bookmark: ${lane.jjBookmark ?? "—"}`,
    `Mode: ${runtimeState?.isActive ? runtimeState.mode : "cold"}`,
  ];

  return lines.join("\n");
}
