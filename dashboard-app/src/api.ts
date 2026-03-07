import type {LaneLiveOutput, LaneResponse, SnapshotResponse} from "./types";

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

export async function sendLaneMessage(laneId: string, message: string, deliverAs: "steer" | "followUp"): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/message`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({message, deliverAs}),
  });
}

export async function fetchLaneLiveOutput(laneId: string): Promise<{readonly ok: true; readonly liveOutput: LaneLiveOutput | null}> {
  return await fetchJson<{readonly ok: true; readonly liveOutput: LaneLiveOutput | null}>(`/api/lanes/${encodeURIComponent(laneId)}/live-output`);
}

export async function createTodo(laneId: string, payload: {readonly title: string; readonly priority: string; readonly notes: string}): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(payload),
  });
}

export async function updateTodo(laneId: string, todoId: string, payload: {readonly title: string; readonly priority: string; readonly notes: string}): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos/${encodeURIComponent(todoId)}`, {
    method: "PATCH",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(payload),
  });
}

export async function setTodoStatus(laneId: string, todoId: string, status: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos/${encodeURIComponent(todoId)}/status`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({status}),
  });
}

export async function approveTodo(laneId: string, todoId: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos/${encodeURIComponent(todoId)}/approve`, {method: "POST"});
}

export async function rejectTodo(laneId: string, todoId: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos/${encodeURIComponent(todoId)}/reject`, {method: "POST"});
}

export async function deleteTodo(laneId: string, todoId: string): Promise<LaneResponse> {
  return await fetchJson<LaneResponse>(`/api/lanes/${encodeURIComponent(laneId)}/todos/${encodeURIComponent(todoId)}`, {method: "DELETE"});
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as {readonly ok?: boolean; readonly error?: string};
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `request failed: ${response.status}`);
  }
  return data as T;
}
