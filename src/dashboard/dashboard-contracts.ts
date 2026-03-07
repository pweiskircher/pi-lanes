import type {PiControlledSession} from "../pi/pi-session-control.js";
import type {Lane, LaneEvent, LaneRuntimeState, LaneTodo} from "../types.js";

export type DashboardMessageDeliveryMode = "steer" | "followUp";

export type LaneLiveOutput = {
  readonly laneId: string;
  readonly isStreaming: boolean;
  readonly role: "assistant";
  readonly content: string;
  readonly updatedAt: string;
};

export type LaneHealth = {
  readonly ok: boolean;
  readonly isIdle: boolean;
  readonly lastActivityAt: string | null;
  readonly lastEventSummary: string | null;
};

export type LaneCounts = {
  readonly proposed: number;
  readonly open: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly done: number;
  readonly dropped: number;
};

export type LaneSnapshot = {
  readonly lane: Lane;
  readonly runtimeState: LaneRuntimeState;
  readonly liveSession: PiControlledSession | null;
  readonly liveSessionHealth: LaneHealth;
  readonly contextText: string;
  readonly recentEvents: ReadonlyArray<LaneEvent>;
  readonly todos: ReadonlyArray<LaneTodo>;
  readonly todoCounts: LaneCounts;
};

export type SnapshotResponse = {
  readonly ok: true;
  readonly lanes: ReadonlyArray<LaneSnapshot>;
};

export type LaneResponse = {
  readonly ok: true;
  readonly lane: LaneSnapshot;
};

export type LaneLiveOutputResponse = {
  readonly ok: true;
  readonly liveOutput: LaneLiveOutput | null;
};
