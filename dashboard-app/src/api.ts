import type {DashboardMessageDeliveryMode, LaneLiveOutputResponse, LaneResponse, SnapshotResponse} from "./types";

export async function fetchSnapshot(): Promise<SnapshotResponse> {
  return await fetchJson<SnapshotResponse>("/api/snapshot");
}

export async function fetchLane(laneId: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}`);
}

export async function saveLaneContext(laneId: string, text: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/context`, {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({text}),
  });
}

export async function sendLaneMessage(laneId: string, message: string, deliverAs: DashboardMessageDeliveryMode): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/message`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({message, deliverAs}),
  });
}

export async function fetchLaneLiveOutput(laneId: string): Promise<LaneLiveOutputResponse> {
  return await fetchJson<LaneLiveOutputResponse>(`/api/lanes/${encodeURIComponent(laneId)}/live-output`);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as {readonly ok?: boolean; readonly error?: string};
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `request failed: ${response.status}`);
  }
  return data as T;
}
