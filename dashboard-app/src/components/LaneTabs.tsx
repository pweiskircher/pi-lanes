import type {LaneSnapshot} from "../types";
import type {LaneTab} from "../ui";
import {getReviewTodoCount} from "../ui";

type LaneTabsProps = {
  readonly lane: LaneSnapshot;
  readonly activeTab: LaneTab;
  readonly onTabChange: (tab: LaneTab) => void;
};

export function LaneTabs({lane, activeTab, onTabChange}: LaneTabsProps) {
  return (
    <div class="lane-tab-bar" role="tablist" aria-label="Lane sections">
      <button type="button" class={`lane-tab ${activeTab === "chat" ? "active" : ""}`} onClick={() => onTabChange("chat")}>
        Chat
      </button>
      <button type="button" class={`lane-tab ${activeTab === "todos" ? "active" : ""}`} onClick={() => onTabChange("todos")}>
        TODOs
        <span class="tab-count">{getReviewTodoCount(lane)}</span>
      </button>
      <button type="button" class={`lane-tab ${activeTab === "events" ? "active" : ""}`} onClick={() => onTabChange("events")}>
        Events
        <span class="tab-count">{lane.recentEvents.length}</span>
      </button>
      <button type="button" class={`lane-tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => onTabChange("settings")}>
        Settings
      </button>
    </div>
  );
}
