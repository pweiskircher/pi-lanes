import type {LaneSnapshot} from "../types";
import {formatRelativeTime, formatTimestamp, shortRepo} from "../ui";

type LaneHeaderProps = {
  readonly lane: LaneSnapshot;
};

export function LaneHeader({lane}: LaneHeaderProps) {
  const runtime = lane.runtimeState;

  return (
    <section class="panel compact-header">
      <div class="header-title-row">
        <div class="header-title-inline">
          <h2>{lane.lane.id}</h2>
          <div class="muted header-subtitle-inline">{lane.lane.title}</div>
        </div>
        <div class="lane-pills header-pills header-pills-secondary">
          <span class="pill">repo {shortRepo(lane.lane.repoPath)}</span>
          <span class="pill">bookmark {lane.lane.jjBookmark ?? "—"}</span>
          <span class="pill">bridge {runtime?.messageBridge ? `127.0.0.1:${runtime.messageBridge.port}` : "offline"}</span>
        </div>
      </div>
      <div class="lane-pills header-pills">
        <span class="pill">mode {runtime?.mode ?? "stopped"}</span>
        <span class="pill">health {lane.liveSessionHealth.ok ? (lane.liveSessionHealth.isIdle ? "idle" : "busy") : "offline"}</span>
        <span class="pill">activity {formatRelativeTime(lane.liveSessionHealth.lastActivityAt)}</span>
        <span class="pill">updated {formatTimestamp(lane.liveSessionHealth.lastActivityAt)}</span>
      </div>
    </section>
  );
}
