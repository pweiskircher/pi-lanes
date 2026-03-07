export type LanePriority = "main" | "side" | "parked";

export type LaneStatus = "active" | "paused" | "archived";

export type Lane = {
  readonly id: string;
  readonly title: string;
  readonly repoPath: string;
  readonly jjBookmark: string | null;
  readonly sessionName: string;
  readonly serverCommand: string | null;
  readonly priority: LanePriority | null;
  readonly status: LaneStatus | null;
  readonly notes: string | null;
  readonly tags: ReadonlyArray<string>;
};

export type LaneRegistry = ReadonlyArray<Lane>;

export type TodoStatus = "proposed" | "open" | "in_progress" | "blocked" | "done" | "dropped";

export type TodoPriority = "low" | "medium" | "high";

export type TodoCreatedBy = "human" | "llm";

export type LaneTodo = {
  readonly id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly status: TodoStatus;
  readonly priority: TodoPriority;
  readonly createdBy: TodoCreatedBy;
  readonly needsReview: boolean;
  readonly proposalReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type LaneTodoFile = {
  readonly laneId: string;
  readonly todos: ReadonlyArray<LaneTodo>;
};

export type LaneRuntimeMode = "idle" | "interactive" | "working" | "waiting_for_input" | "blocked" | "stopped";

export type LaneRuntimeMessageBridge = {
  readonly port: number;
  readonly authToken: string;
};

export type LaneEventKind =
  | "session_start"
  | "session_shutdown"
  | "agent_start"
  | "agent_end"
  | "turn_end"
  | "input"
  | "dashboard_message"
  | "todo_proposed"
  | "status";

export type LaneEvent = {
  readonly timestamp: string;
  readonly kind: LaneEventKind;
  readonly summary: string;
  readonly details: string | null;
};

export type LaneEventLog = {
  readonly laneId: string;
  readonly events: ReadonlyArray<LaneEvent>;
};

export type LaneRuntimeState = {
  readonly laneId: string;
  readonly isActive: boolean;
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly sessionName: string;
  readonly sessionId: string | null;
  readonly repoPath: string;
  readonly mode: LaneRuntimeMode;
  readonly currentTodoId: string | null;
  readonly currentSummary: string | null;
  readonly needsInput: string | null;
  readonly lastHumanInstruction: string | null;
  readonly messageBridge: LaneRuntimeMessageBridge | null;
};

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type ValidationResult<T> =
  | {
      readonly success: true;
      readonly data: T;
    }
  | {
      readonly success: false;
      readonly issues: ReadonlyArray<ValidationIssue>;
    };

export type CreateHumanTodoOptions = {
  readonly title: string;
  readonly priority: TodoPriority;
  readonly notes: string | null;
  readonly now: string;
  readonly id: string;
};
