import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
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
import {ChatTab} from "./components/ChatTab";
import {EventsTab} from "./components/EventsTab";
import {LaneHeader} from "./components/LaneHeader";
import {LaneTabs} from "./components/LaneTabs";
import {SettingsTab} from "./components/SettingsTab";
import {TodoBoard} from "./components/TodoBoard";
import type {LaneSnapshot} from "./types";
import {createConversationKey, createTodoDraftMap, groupTodosByStatus, isScrolledNearBottom, mergeTodoDraftMap, shortRepo, type LaneUiState, type TodoDraft} from "./ui";
import "./styles.css";

const SELECTED_LANE_STORAGE_KEY = "pi-lanes.selected-lane-id";
const POLL_MS = 10000;

function App() {
  const [lanes, setLanes] = useState<ReadonlyArray<LaneSnapshot>>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(() => loadSelectedLaneId());
  const [selectedLane, setSelectedLane] = useState<LaneSnapshot | null>(null);
  const [uiState, setUiState] = useState<LaneUiState>({
    activeTab: "chat",
    messageText: "",
    messageMode: "steer",
    contextText: "",
  });
  const [todoDrafts, setTodoDrafts] = useState<Record<string, TodoDraft>>({});
  const [newTodo, setNewTodo] = useState({title: "", priority: "medium", notes: ""});
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const shouldStickConversationToBottomRef = useRef(true);
  const previousConversationKeyRef = useRef<string | null>(null);

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
    shouldStickConversationToBottomRef.current = true;
    previousConversationKeyRef.current = null;
  }, [selectedLane?.lane.id]);

  useEffect(() => {
    if (!selectedLane) return;
    setTodoDrafts(previous => mergeTodoDraftMap(previous, selectedLane.todos));
  }, [selectedLane?.todos]);

  useEffect(() => {
    const element = conversationRef.current;
    if (!element) return;

    const messages = selectedLane?.liveSession?.recentMessages ?? [];
    const conversationKey = createConversationKey(messages);
    const hasConversationChanged = conversationKey !== previousConversationKeyRef.current;
    previousConversationKeyRef.current = conversationKey;

    if (hasConversationChanged && shouldStickConversationToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
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
    setUiState({activeTab: "chat", messageText: "", messageMode: "steer", contextText: laneResponse.lane.contextText});
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

  function handleConversationScroll(event: Event): void {
    const element = event.currentTarget;
    if (!(element instanceof HTMLDivElement)) {
      return;
    }
    shouldStickConversationToBottomRef.current = isScrolledNearBottom(element);
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

  const todoGroups = selectedLane ? groupTodosByStatus(selectedLane.todos) : null;

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
              <LaneHeader lane={selectedLane} />
              <section class="lane-tabs-shell">
                <LaneTabs lane={selectedLane} activeTab={uiState.activeTab} onTabChange={activeTab => setUiState(state => ({...state, activeTab}))} />

                {uiState.activeTab === "chat" ? (
                  <ChatTab
                    lane={selectedLane}
                    conversationRef={conversationRef}
                    messageText={uiState.messageText}
                    messageMode={uiState.messageMode}
                    onConversationScroll={handleConversationScroll}
                    onMessageTextChange={messageText => setUiState(state => ({...state, messageText}))}
                    onMessageModeChange={messageMode => setUiState(state => ({...state, messageMode}))}
                    onSendMessage={() => void handleSendMessage()}
                  />
                ) : null}

                {uiState.activeTab === "todos" && todoGroups ? (
                  <TodoBoard
                    lane={selectedLane}
                    todoGroups={todoGroups}
                    todoDrafts={todoDrafts}
                    newTodo={newTodo}
                    onNewTodoChange={setNewTodo}
                    onDraftChange={(todoId, draft) => setTodoDrafts(current => ({...current, [todoId]: draft}))}
                    onCreateTodo={() => void handleCreateTodo()}
                    onSaveTodo={todoId => void handleSaveTodo(todoId)}
                    onSetStatus={(todoId, status) => void handleStatusChange(todoId, status)}
                    onApprove={todoId => void handleApproveTodo(todoId)}
                    onReject={todoId => void handleRejectTodo(todoId)}
                    onDelete={todoId => void handleDeleteTodo(todoId)}
                  />
                ) : null}

                {uiState.activeTab === "settings" ? (
                  <SettingsTab
                    contextText={uiState.contextText}
                    onContextTextChange={contextText => setUiState(state => ({...state, contextText}))}
                    onSaveContext={() => void handleSaveContext()}
                  />
                ) : null}

                {uiState.activeTab === "events" ? <EventsTab lane={selectedLane} /> : null}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
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

render(<App />, document.getElementById("app")!);
