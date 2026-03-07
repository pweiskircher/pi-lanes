import {render} from "preact";
import {useEffect, useMemo, useRef, useState} from "preact/hooks";
import {
  approveTodo,
  createTodo,
  deleteTodo,
  fetchLane,
  fetchSnapshot,
  rejectTodo,
  saveLaneContext,
  sendLaneMessage,
  setTodoStatus,
  updateTodo,
} from "./api";
import type {LaneMessage, LaneSnapshot, LaneTodo} from "./types";
import "./styles.css";

const SELECTED_LANE_STORAGE_KEY = "pi-lanes.selected-lane-id";
const POLL_MS = 10000;

type LaneUiState = {
  readonly messageText: string;
  readonly messageMode: "steer" | "followUp";
  readonly contextText: string;
  readonly settingsOpen: boolean;
  readonly eventsOpen: boolean;
};

function App() {
  const [lanes, setLanes] = useState<ReadonlyArray<LaneSnapshot>>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(() => loadSelectedLaneId());
  const [selectedLane, setSelectedLane] = useState<LaneSnapshot | null>(null);
  const [uiState, setUiState] = useState<LaneUiState>({
    messageText: "",
    messageMode: "steer",
    contextText: "",
    settingsOpen: false,
    eventsOpen: false,
  });
  const [todoDrafts, setTodoDrafts] = useState<Record<string, {readonly title: string; readonly priority: string; readonly notes: string}>>({});
  const [newTodo, setNewTodo] = useState({title: "", priority: "medium", notes: ""});
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const initialConversationScrollDoneRef = useRef(false);

  useEffect(() => {
    void refreshSnapshot();
    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [selectedLaneId]);

  useEffect(() => {
    if (!selectedLane) return;
    setUiState(state => ({...state, contextText: state.contextText || selectedLane.contextText}));
    setTodoDrafts(createTodoDraftMap(selectedLane.todos));
    setNewTodo({title: "", priority: "medium", notes: ""});
    initialConversationScrollDoneRef.current = false;
  }, [selectedLane?.lane.id]);

  useEffect(() => {
    if (!selectedLane) return;
    setTodoDrafts(previous => mergeTodoDraftMap(previous, selectedLane.todos));
  }, [selectedLane?.todos]);

  useEffect(() => {
    const element = conversationRef.current;
    if (!element) return;
    if (!initialConversationScrollDoneRef.current) {
      element.scrollTop = element.scrollHeight;
      initialConversationScrollDoneRef.current = true;
    }
  }, [selectedLane?.liveSession?.recentMessages]);

  async function refreshSnapshot(): Promise<void> {
    const snapshot = await fetchSnapshot();
    setLanes(snapshot.lanes);

    if (!selectedLaneId) {
      return;
    }

    const laneExists = snapshot.lanes.some(lane => lane.lane.id === selectedLaneId);
    if (!laneExists) {
      setSelectedLaneId(null);
      saveSelectedLaneId(null);
      setSelectedLane(null);
      return;
    }

    const laneResponse = await fetchLane(selectedLaneId);
    setSelectedLane(laneResponse.lane);
  }

  async function selectLane(laneId: string): Promise<void> {
    setSelectedLaneId(laneId);
    saveSelectedLaneId(laneId);
    const laneResponse = await fetchLane(laneId);
    setSelectedLane(laneResponse.lane);
    setUiState({messageText: "", messageMode: "steer", contextText: laneResponse.lane.contextText, settingsOpen: false, eventsOpen: false});
  }

  async function handleSaveContext(): Promise<void> {
    if (!selectedLane) return;
    const response = await saveLaneContext(selectedLane.lane.id, uiState.contextText);
    setSelectedLane(response.lane);
  }

  async function handleSendMessage(): Promise<void> {
    if (!selectedLane || uiState.messageText.trim().length === 0) return;
    const response = await sendLaneMessage(selectedLane.lane.id, uiState.messageText, uiState.messageMode);
    setSelectedLane(response.lane);
    setUiState(state => ({...state, messageText: ""}));
    requestAnimationFrame(() => {
      const element = conversationRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }

  async function handleCreateTodo(): Promise<void> {
    if (!selectedLane || newTodo.title.trim().length === 0) return;
    const response = await createTodo(selectedLane.lane.id, newTodo);
    setSelectedLane(response.lane);
    setNewTodo({title: "", priority: "medium", notes: ""});
  }

  async function handleSaveTodo(todoId: string): Promise<void> {
    if (!selectedLane) return;
    const draft = todoDrafts[todoId];
    if (!draft) return;
    const response = await updateTodo(selectedLane.lane.id, todoId, draft);
    setSelectedLane(response.lane);
  }

  async function handleStatusChange(todoId: string, status: string): Promise<void> {
    if (!selectedLane) return;
    const response = await setTodoStatus(selectedLane.lane.id, todoId, status);
    setSelectedLane(response.lane);
  }

  async function handleApproveTodo(todoId: string): Promise<void> {
    if (!selectedLane) return;
    const response = await approveTodo(selectedLane.lane.id, todoId);
    setSelectedLane(response.lane);
  }

  async function handleRejectTodo(todoId: string): Promise<void> {
    if (!selectedLane) return;
    const response = await rejectTodo(selectedLane.lane.id, todoId);
    setSelectedLane(response.lane);
  }

  async function handleDeleteTodo(todoId: string): Promise<void> {
    if (!selectedLane) return;
    const response = await deleteTodo(selectedLane.lane.id, todoId);
    setSelectedLane(response.lane);
  }

  const selectedRuntime = selectedLane?.runtimeState;

  return (
    <main class="app-shell">
      <header class="topbar">
        <strong>pi lanes dashboard</strong>
        <button type="button" onClick={() => void refreshSnapshot()}>Refresh</button>
      </header>
      <div class="layout">
        <aside class="sidebar">
          {lanes.map(lane => (
            <button type="button" class={`lane-card ${lane.lane.id === selectedLaneId ? "active" : ""}`} onClick={() => void selectLane(lane.lane.id)}>
              <div class="lane-card-title">{lane.lane.id}</div>
              <div class="muted">{lane.lane.title}</div>
              <div class="lane-pills">
                <span class="pill">repo {shortRepo(lane.lane.repoPath)}</span>
                <span class="pill">open {lane.todoCounts.open}</span>
                <span class="pill">proposed {lane.todoCounts.proposed}</span>
                {lane.liveSessionHealth.ok ? <span class={`pill ${lane.liveSessionHealth.isIdle ? "ok" : "busy"}`}>{lane.liveSessionHealth.isIdle ? "idle" : "busy"}</span> : null}
              </div>
            </button>
          ))}
        </aside>
        <section class="detail">
          {!selectedLane ? (
            <div class="muted">Select a lane.</div>
          ) : (
            <>
              <section class="panel compact-header">
                <h2>{selectedLane.lane.id}</h2>
                <div class="muted">{selectedLane.lane.title}</div>
                <div class="lane-pills header-pills">
                  <span class="pill">mode {selectedRuntime?.mode ?? "stopped"}</span>
                  <span class="pill">todo {selectedRuntime?.currentTodoId ?? "—"}</span>
                  <span class="pill">health {selectedLane.liveSessionHealth.ok ? (selectedLane.liveSessionHealth.isIdle ? "idle" : "busy") : "offline"}</span>
                  <span class="pill">activity {formatRelativeTime(selectedLane.liveSessionHealth.lastActivityAt)}</span>
                </div>
                <details>
                  <summary>Lane details</summary>
                  <div class="lane-pills header-pills details-pills">
                    <span class="pill">repo {shortRepo(selectedLane.lane.repoPath)}</span>
                    <span class="pill">bookmark {selectedLane.lane.jjBookmark ?? "—"}</span>
                    <span class="pill">bridge {selectedRuntime?.messageBridge ? `127.0.0.1:${selectedRuntime.messageBridge.port}` : "offline"}</span>
                    <span class="pill">last activity {formatTimestamp(selectedLane.liveSessionHealth.lastActivityAt)}</span>
                  </div>
                </details>
              </section>

              <section class="panel">
                <h3>Recent conversation</h3>
                <div class="muted">Last 10 lane messages, formatted for quick steering.</div>
                <div class="conversation-scroll" ref={conversationRef}>
                  {(selectedLane.liveSession?.recentMessages ?? []).slice(-10).map(message => <MessageItem key={`${message.role}-${message.timestamp ?? "none"}-${message.content.slice(0, 32)}`} message={message} />)}
                  {(selectedLane.liveSession?.recentMessages ?? []).length === 0 ? <div class="muted">No recent session messages found.</div> : null}
                </div>
              </section>

              <section class="panel">
                <h3>Send message</h3>
                <div class="muted">Send a steering message by default, or switch to follow-up.</div>
                <div class="composer-row">
                  <select value={uiState.messageMode} onChange={event => setUiState(state => ({...state, messageMode: (event.currentTarget.value === "followUp" ? "followUp" : "steer")}))}>
                    <option value="steer">steer</option>
                    <option value="followUp">follow up</option>
                  </select>
                  <button type="button" onClick={() => void handleSendMessage()} disabled={!selectedRuntime?.messageBridge}>Send</button>
                </div>
                <textarea value={uiState.messageText} onInput={event => setUiState(state => ({...state, messageText: event.currentTarget.value}))} placeholder="Tell the lane what to do next…" disabled={!selectedRuntime?.messageBridge} />
                <div class="muted">{selectedLane.liveSessionHealth.ok ? `Lane is ${selectedLane.liveSessionHealth.isIdle ? "idle" : "busy"}${selectedLane.liveSessionHealth.lastEventSummary ? ` — ${selectedLane.liveSessionHealth.lastEventSummary}` : ""}` : "This lane is offline or was not started with the lane bridge."}</div>
              </section>

              <section class="panel">
                <details open={uiState.settingsOpen} onToggle={event => setUiState(state => ({...state, settingsOpen: (event.currentTarget as HTMLDetailsElement).open}))}>
                  <summary>Lane settings</summary>
                  <div class="muted section-gap">Lane-specific notes and configuration helpers.</div>
                  <strong>Lane context</strong>
                  <textarea value={uiState.contextText} onInput={event => setUiState(state => ({...state, contextText: event.currentTarget.value}))} />
                  <div class="actions-row">
                    <button type="button" onClick={() => void handleSaveContext()}>Save context</button>
                  </div>
                </details>
              </section>

              <section class="panel">
                <details open={uiState.eventsOpen} onToggle={event => setUiState(state => ({...state, eventsOpen: (event.currentTarget as HTMLDetailsElement).open}))}>
                  <summary>Recent events</summary>
                  <div class="section-gap">
                    {selectedLane.recentEvents.map(event => <EventItem key={`${event.timestamp}-${event.kind}`} event={event} />)}
                  </div>
                </details>
              </section>

              <section class="panel">
                <h3>Add TODO</h3>
                <div class="todo-create-row">
                  <input type="text" value={newTodo.title} placeholder="TODO title" onInput={event => setNewTodo(state => ({...state, title: event.currentTarget.value}))} />
                  <select value={newTodo.priority} onChange={event => setNewTodo(state => ({...state, priority: event.currentTarget.value}))}>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="low">low</option>
                  </select>
                  <button type="button" onClick={() => void handleCreateTodo()}>Add</button>
                </div>
                <textarea value={newTodo.notes} placeholder="Optional notes" onInput={event => setNewTodo(state => ({...state, notes: event.currentTarget.value}))} />
              </section>

              <section class="panel">
                <h3>TODOs</h3>
                <div class="todo-list">
                  {selectedLane.todos.length === 0 ? <div class="muted">No TODOs.</div> : selectedLane.todos.map(todo => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      draft={todoDrafts[todo.id] ?? {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""}}
                      onDraftChange={draft => setTodoDrafts(current => ({...current, [todo.id]: draft}))}
                      onSave={() => void handleSaveTodo(todo.id)}
                      onSetStatus={status => void handleStatusChange(todo.id, status)}
                      onApprove={() => void handleApproveTodo(todo.id)}
                      onReject={() => void handleRejectTodo(todo.id)}
                      onDelete={() => void handleDeleteTodo(todo.id)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

type MessageItemProps = {message: LaneMessage};

function MessageItem({message}: MessageItemProps) {
  return (
    <div class={`message ${message.role}`}>
      <div class="message-header">
        <div class="message-role">{message.role}</div>
        <div class="muted">{formatTimestamp(message.timestamp)}</div>
      </div>
      <div class="message-body">{message.content}</div>
    </div>
  );
}

function EventItem({event}: {readonly event: LaneSnapshot["recentEvents"][number]}) {
  return (
    <div class="event-item">
      <div class="message-header">
        <strong>{event.kind}</strong>
        <span class="muted">{formatTimestamp(event.timestamp)}</span>
      </div>
      <div>{event.summary}</div>
      {event.details ? <div class="muted">{event.details}</div> : null}
    </div>
  );
}

type TodoDraft = {readonly title: string; readonly priority: string; readonly notes: string};

type TodoItemProps = {
  readonly todo: LaneTodo;
  readonly draft: TodoDraft;
  readonly onDraftChange: (draft: TodoDraft) => void;
  readonly onSave: () => void;
  readonly onSetStatus: (status: string) => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onDelete: () => void;
};

function TodoItem(props: TodoItemProps) {
  const {todo, draft, onDraftChange, onSave, onSetStatus, onApprove, onReject, onDelete} = props;
  return (
    <div class="todo-card">
      <div class="message-header">
        <div>
          <strong>{todo.id}</strong> <span class={`status-${todo.status}`}>[{todo.status}]</span>
        </div>
        <div class="actions-row">
          {todo.status === "proposed" ? (
            <>
              <button type="button" onClick={onApprove}>Approve</button>
              <button type="button" onClick={onReject}>Reject</button>
            </>
          ) : null}
          <button type="button" onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div class="todo-edit-row">
        <input type="text" value={draft.title} onInput={event => onDraftChange({...draft, title: event.currentTarget.value})} />
        <select value={draft.priority} onChange={event => onDraftChange({...draft, priority: event.currentTarget.value})}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <select value={todo.status} onChange={event => onSetStatus(event.currentTarget.value)}>
          <option value="open">open</option>
          <option value="in_progress">in_progress</option>
          <option value="blocked">blocked</option>
          <option value="done">done</option>
          <option value="dropped">dropped</option>
        </select>
      </div>
      <textarea value={draft.notes} onInput={event => onDraftChange({...draft, notes: event.currentTarget.value})} />
      <div class="actions-row">
        <button type="button" onClick={onSave}>Save</button>
      </div>
      {todo.proposalReason ? <div class="muted">Reason: {todo.proposalReason}</div> : null}
    </div>
  );
}

function loadSelectedLaneId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_LANE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSelectedLaneId(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(SELECTED_LANE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SELECTED_LANE_STORAGE_KEY, value);
    }
  } catch {
    // ignore
  }
}

function shortRepo(value: string): string {
  const parts = value.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || value;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatRelativeTime(value: string | null): string {
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

function createTodoDraftMap(todos: ReadonlyArray<LaneTodo>): Record<string, TodoDraft> {
  return Object.fromEntries(todos.map(todo => [todo.id, {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""}]));
}

function mergeTodoDraftMap(current: Record<string, TodoDraft>, todos: ReadonlyArray<LaneTodo>): Record<string, TodoDraft> {
  const next: Record<string, TodoDraft> = {};
  for (const todo of todos) {
    next[todo.id] = current[todo.id] ?? {title: todo.title, priority: todo.priority, notes: todo.notes ?? ""};
  }
  return next;
}

render(<App />, document.getElementById("app")!);
