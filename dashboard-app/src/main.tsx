import {render} from "preact";
import {useEffect, useRef, useState} from "preact/hooks";
import {
  fetchLaneLiveOutput,
  fetchSnapshot,
  saveLaneContext,
  sendLaneMessage,
} from "./api";
import {ChatTab} from "./components/ChatTab";
import {EventsTab} from "./components/EventsTab";
import {LaneHeader} from "./components/LaneHeader";
import {LaneTabs} from "./components/LaneTabs";
import {SettingsTab} from "./components/SettingsTab";
import type {LaneLiveOutput, LaneSnapshot} from "./types";
import {createConversationKey, isScrolledNearBottom, shortRepo, type LaneUiState} from "./ui";
import "./styles.css";

const SELECTED_LANE_STORAGE_KEY = "pi-lanes.selected-lane-id";
const POLL_MS = 10000;
const LIVE_OUTPUT_POLL_MS = 600;

function App() {
  const [lanes, setLanes] = useState<ReadonlyArray<LaneSnapshot>>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(() => loadSelectedLaneId());
  const [selectedLane, setSelectedLane] = useState<LaneSnapshot | null>(null);
  const [liveOutput, setLiveOutput] = useState<LaneLiveOutput | null>(null);
  const [recentCompletedLiveOutput, setRecentCompletedLiveOutput] = useState<LaneLiveOutput | null>(null);
  const [uiState, setUiState] = useState<LaneUiState>({
    activeTab: "chat",
    messageText: "",
    messageMode: "steer",
    contextText: "",
  });
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
    setLiveOutput(null);
    setRecentCompletedLiveOutput(null);
    shouldStickConversationToBottomRef.current = true;
    previousConversationKeyRef.current = null;
  }, [selectedLane?.lane.id]);

  useEffect(() => {
    const element = conversationRef.current;
    if (!element) return;

    const messages = selectedLane?.liveSession?.recentMessages ?? [];
    const conversationKey = `${createConversationKey(messages)}:${liveOutput?.updatedAt ?? "none"}:${liveOutput?.isStreaming === true ? "streaming" : "idle"}:${recentCompletedLiveOutput?.updatedAt ?? "none"}`;
    const hasConversationChanged = conversationKey !== previousConversationKeyRef.current;
    previousConversationKeyRef.current = conversationKey;

    if (hasConversationChanged && shouldStickConversationToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [liveOutput?.isStreaming, liveOutput?.updatedAt, recentCompletedLiveOutput?.updatedAt, selectedLane?.liveSession?.recentMessages]);

  useEffect(() => {
    if (!selectedLaneId || uiState.activeTab !== "chat") {
      setLiveOutput(null);
      setRecentCompletedLiveOutput(null);
      return;
    }

    let cancelled = false;

    const refreshLiveOutput = async (): Promise<void> => {
      try {
        const response = await fetchLaneLiveOutput(selectedLaneId);
        if (!cancelled) {
          setLiveOutput(currentLiveOutput => {
            if (currentLiveOutput?.isStreaming && response.liveOutput === null) {
              setRecentCompletedLiveOutput(currentLiveOutput);
            }
            return response.liveOutput;
          });
        }
      } catch {
        if (!cancelled) {
          setLiveOutput(null);
        }
      }
    };

    void refreshLiveOutput();
    const interval = window.setInterval(() => {
      void refreshLiveOutput();
    }, LIVE_OUTPUT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedLaneId, uiState.activeTab]);

  useEffect(() => {
    if (!selectedLane) {
      return;
    }
    const lastAssistantMessage = [...(selectedLane.liveSession?.recentMessages ?? [])].reverse().find(message => message.role === "assistant") ?? null;
    if (liveOutput && lastAssistantMessage?.content === liveOutput.content) {
      setLiveOutput(null);
    }
    if (recentCompletedLiveOutput && lastAssistantMessage?.content === recentCompletedLiveOutput.content) {
      setRecentCompletedLiveOutput(null);
    }
  }, [liveOutput, recentCompletedLiveOutput, selectedLane]);

  async function refreshSnapshot(): Promise<void> {
    const snapshot = await fetchSnapshot();
    setLanes(snapshot.lanes);

    if (!selectedLaneId) {
      return;
    }

    const selectedLaneSnapshot = snapshot.lanes.find(lane => lane.lane.id === selectedLaneId) ?? null;
    if (!selectedLaneSnapshot) {
      setSelectedLaneId(null);
      saveSelectedLaneId(null);
      setSelectedLane(null);
      setLiveOutput(null);
      setRecentCompletedLiveOutput(null);
      return;
    }

    setSelectedLane(selectedLaneSnapshot);
  }

  async function selectLane(laneId: string): Promise<void> {
    setSelectedLaneId(laneId);
    saveSelectedLaneId(laneId);
    const laneSnapshot = lanes.find(lane => lane.lane.id === laneId) ?? null;
    setSelectedLane(laneSnapshot);
    setUiState({activeTab: "chat", messageText: "", messageMode: "steer", contextText: laneSnapshot?.contextText ?? ""});
  }

  async function handleSaveContext(): Promise<void> {
    if (!selectedLane) return;
    const response = await saveLaneContext(selectedLane.lane.id, uiState.contextText);
    applyLaneUpdate(response.lane);
  }

  async function handleSendMessage(): Promise<void> {
    if (!selectedLane || uiState.messageText.trim().length === 0) return;
    const response = await sendLaneMessage(selectedLane.lane.id, uiState.messageText, uiState.messageMode);
    applyLaneUpdate(response.lane);
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

  function applyLaneUpdate(updatedLane: LaneSnapshot): void {
    setSelectedLane(currentSelectedLane => currentSelectedLane?.lane.id === updatedLane.lane.id ? updatedLane : currentSelectedLane);
    setLanes(currentLanes => currentLanes.map(lane => lane.lane.id === updatedLane.lane.id ? updatedLane : lane));
  }

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
                <span class="pill">mode {lane.runtimeState.mode}</span>
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
                    liveOutput={liveOutput}
                    recentCompletedLiveOutput={recentCompletedLiveOutput}
                    conversationRef={conversationRef}
                    messageText={uiState.messageText}
                    messageMode={uiState.messageMode}
                    onConversationScroll={handleConversationScroll}
                    onMessageTextChange={messageText => setUiState(state => ({...state, messageText}))}
                    onMessageModeChange={messageMode => setUiState(state => ({...state, messageMode}))}
                    onSendMessage={() => void handleSendMessage()}
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
