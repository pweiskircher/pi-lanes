import type {LaneSnapshot} from "../types";
import {formatTimestamp} from "../ui";

type EventsTabProps = {
  readonly lane: LaneSnapshot;
};

export function EventsTab({lane}: EventsTabProps) {
  return (
    <section class="panel">
      <div class="tab-panel-header">
        <h3>Recent events</h3>
        <span class="pill">{lane.recentEvents.length}</span>
      </div>
      <div class="muted">Recent lane activity and bridge telemetry.</div>
      <div class="section-gap">
        {lane.recentEvents.length === 0 ? <div class="muted">No recent events.</div> : lane.recentEvents.map(event => <EventItem key={`${event.timestamp}-${event.kind}`} event={event} />)}
      </div>
    </section>
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
