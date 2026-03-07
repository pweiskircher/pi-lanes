import type {LaneLiveOutput, LaneMessage, LaneSnapshot} from "../types";
import {formatTimestamp} from "../ui";

type ChatTabProps = {
  readonly lane: LaneSnapshot;
  readonly liveOutput: LaneLiveOutput | null;
  readonly recentCompletedLiveOutput: LaneLiveOutput | null;
  readonly conversationRef: {current: HTMLDivElement | null};
  readonly messageText: string;
  readonly messageMode: "steer" | "followUp";
  readonly onConversationScroll: (event: Event) => void;
  readonly onMessageTextChange: (value: string) => void;
  readonly onMessageModeChange: (value: "steer" | "followUp") => void;
  readonly onSendMessage: () => void;
};

export function ChatTab(props: ChatTabProps) {
  const {lane, liveOutput, recentCompletedLiveOutput, conversationRef, messageText, messageMode, onConversationScroll, onMessageTextChange, onMessageModeChange, onSendMessage} = props;
  const runtime = lane.runtimeState;

  return (
    <>
      <section class="panel">
        <h3>Recent conversation</h3>
        <div class="conversation-scroll" ref={conversationRef} onScroll={onConversationScroll}>
          {(lane.liveSession?.recentMessages ?? []).slice(-10).map(message => (
            <MessageItem key={`${message.role}-${message.timestamp ?? "none"}-${message.content.slice(0, 32)}`} message={message} />
          ))}
          {liveOutput ? <LiveMessageItem liveOutput={liveOutput} label="live" /> : null}
          {!liveOutput && recentCompletedLiveOutput ? <LiveMessageItem liveOutput={recentCompletedLiveOutput} label="just finished" /> : null}
          {(lane.liveSession?.recentMessages ?? []).length === 0 && !liveOutput && !recentCompletedLiveOutput ? <div class="muted">No recent session messages found.</div> : null}
        </div>
      </section>

      <section class="panel composer-panel">
        <div class="composer-header-row">
          <div>
            <h3>Send message</h3>
          </div>
          <div class="composer-mode-switch" role="tablist" aria-label="Message delivery mode">
            <button type="button" class={`mode-chip ${messageMode === "steer" ? "active" : ""}`} onClick={() => onMessageModeChange("steer")}>
              Steer now
            </button>
            <button type="button" class={`mode-chip ${messageMode === "followUp" ? "active" : ""}`} onClick={() => onMessageModeChange("followUp")}>
              Follow up
            </button>
          </div>
        </div>

        <div class="composer-shell">
          <textarea
            class="composer-textarea"
            value={messageText}
            onInput={event => onMessageTextChange(event.currentTarget.value)}
            placeholder="Tell the lane what to do next…"
            disabled={!runtime?.messageBridge}
          />
          <div class="composer-footer-row">
            <div class="composer-status">
              {lane.liveSessionHealth.ok ? (
                <>
                  <span class={`status-dot ${lane.liveSessionHealth.isIdle ? "idle" : "busy"}`} />
                  <span>
                    Lane is {lane.liveSessionHealth.isIdle ? "idle" : "busy"}
                    {lane.liveSessionHealth.lastEventSummary ? ` — ${lane.liveSessionHealth.lastEventSummary}` : ""}
                  </span>
                </>
              ) : (
                <span>This lane is offline or was not started with the lane bridge.</span>
              )}
            </div>
            <button type="button" class="primary-button" onClick={onSendMessage} disabled={!runtime?.messageBridge}>
              Send
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function LiveMessageItem({liveOutput, label}: {readonly liveOutput: LaneLiveOutput; readonly label: string}) {
  return (
    <div class="message assistant live-message">
      <div class="message-header">
        <div class="message-role">assistant</div>
        <div class="muted">{label}</div>
      </div>
      <div class="message-body">{liveOutput.content || "…"}</div>
    </div>
  );
}

function MessageItem({message}: {readonly message: LaneMessage}) {
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
