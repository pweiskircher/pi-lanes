export type TodoStatus = "proposed" | "open" | "in_progress" | "blocked" | "done" | "dropped";

export type Lane = {
  readonly id: string;
  readonly title: string;
  readonly repoPath: string;
  readonly jjBookmark: string | null;
  readonly sessionName: string;
};

export type LaneRuntimeState = {
  readonly laneId: string;
  readonly isActive: boolean;
  readonly updatedAt: string;
  readonly mode: string;
  readonly currentTodoId: string | null;
  readonly messageBridge: {readonly port: number; readonly authToken: string} | null;
};

export type LaneTodo = {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly status: TodoStatus;
  readonly priority: string;
  readonly proposalReason: string | null;
};

export type LaneMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string | null;
};

export type LaneLiveSession = {
  readonly sessionId: string;
  readonly name: string | null;
  readonly aliases: ReadonlyArray<string>;
  readonly cwd: string | null;
  readonly isIdle: boolean | null;
  readonly lastUser: string | null;
  readonly lastAssistant: string | null;
  readonly recentMessages: ReadonlyArray<LaneMessage>;
};

export type LaneEvent = {
  readonly timestamp: string;
  readonly kind: string;
  readonly summary: string;
  readonly details: string | null;
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
  readonly liveSession: LaneLiveSession | null;
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
