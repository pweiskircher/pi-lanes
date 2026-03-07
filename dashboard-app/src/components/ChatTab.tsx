import {useState} from "preact/hooks";
import type {LaneMessage, LaneSnapshot} from "../types";
import {formatTimestamp} from "../ui";

type ChatTabProps = {
  readonly lane: LaneSnapshot;
  readonly conversationRef: {current: HTMLDivElement | null};
  readonly messageText: string;
  readonly messageMode: "steer" | "followUp";
  readonly onConversationScroll: (event: Event) => void;
  readonly onMessageTextChange: (value: string) => void;
  readonly onMessageModeChange: (value: "steer" | "followUp") => void;
  readonly onSendMessage: () => void;
};

export function ChatTab(props: ChatTabProps) {
  const {lane, conversationRef, messageText, messageMode, onConversationScroll, onMessageTextChange, onMessageModeChange, onSendMessage} = props;
  const runtime = lane.runtimeState;

  return (
    <>
      <section class="panel">
        <h3>Recent conversation</h3>
        <div class="muted">Last 10 lane messages, formatted for quick steering.</div>
        <div class="conversation-scroll" ref={conversationRef} onScroll={onConversationScroll}>
          {(lane.liveSession?.recentMessages ?? []).slice(-10).map(message => (
            <MessageItem key={`${message.role}-${message.timestamp ?? "none"}-${message.content.slice(0, 32)}`} message={message} />
          ))}
          {(lane.liveSession?.recentMessages ?? []).length === 0 ? <div class="muted">No recent session messages found.</div> : null}
        </div>
      </section>

      <section class="panel composer-panel">
        <div class="composer-header-row">
          <div>
            <h3>Send message</h3>
            <div class="muted">Steer the lane now, or leave a queued follow-up.</div>
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

function MessageItem({message}: {readonly message: LaneMessage}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lineCount = message.content.split("\n").length;
  const isLongMessage = lineCount > 8 || message.content.length > 420;

  return (
    <div class={`message ${message.role}`}>
      <div class="message-header">
        <div class="message-role">{message.role}</div>
        <div class="muted">{formatTimestamp(message.timestamp)}</div>
      </div>
      <div class={`message-body ${!isExpanded && isLongMessage ? "clamped" : ""}`}>{message.content}</div>
      {isLongMessage ? (
        <div class="message-actions-row">
          <button type="button" class="text-button" onClick={() => setIsExpanded(value => !value)}>
            {isExpanded ? "Show less" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
