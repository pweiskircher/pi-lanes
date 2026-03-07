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
