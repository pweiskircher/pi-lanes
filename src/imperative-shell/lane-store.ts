// pattern: Imperative Shell

import {access, mkdir} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import {homedir} from "node:os";
import {resolve} from "node:path";
import {parseLaneEventLog, parseLaneRegistry, parseLaneRuntimeState, parseLaneTodoFile} from "../functional-core/validate-lane-data.js";
import type {Lane, LaneEventLog, LaneRegistry, LaneRuntimeState, LaneTodoFile} from "../types.js";
import {readJsonFile, writeJsonFile} from "./json-files.js";

export type LanePaths = {
  readonly rootPath: string;
  readonly configPath: string;
  readonly settingsPath: string;
  readonly runtimeDirectoryPath: string;
  readonly todosDirectoryPath: string;
  readonly contextDirectoryPath: string;
  readonly eventsDirectoryPath: string;
};

export async function ensureLaneHome(paths: LanePaths): Promise<void> {
  await mkdir(paths.rootPath, {recursive: true});
  await mkdir(paths.runtimeDirectoryPath, {recursive: true});
  await mkdir(paths.todosDirectoryPath, {recursive: true});
  await mkdir(paths.contextDirectoryPath, {recursive: true});
  await mkdir(paths.eventsDirectoryPath, {recursive: true});

  try {
    await access(paths.configPath, fsConstants.F_OK);
  } catch {
    await writeJsonFile(paths.configPath, []);
  }

  try {
    await access(paths.settingsPath, fsConstants.F_OK);
  } catch {
    await writeJsonFile(paths.settingsPath, {});
  }
}

export async function loadLaneRegistry(paths: LanePaths): Promise<LaneRegistry> {
  await ensureLaneHome(paths);
  const parsed = parseLaneRegistry(await readJsonFile(paths.configPath));
  if (!parsed.success) {
    throw new Error(formatIssues(`invalid lane registry at ${paths.configPath}`, parsed.issues));
  }
  return parsed.data;
}

export async function saveLaneRegistry(paths: LanePaths, lanes: LaneRegistry): Promise<void> {
  await ensureLaneHome(paths);
  await writeJsonFile(paths.configPath, lanes);
}

export function getLaneById(lanes: LaneRegistry, laneId: string): Lane {
  const lane = lanes.find(candidate => candidate.id === laneId);
  if (!lane) {
    throw new Error(`unknown lane: ${laneId}`);
  }
  return lane;
}

export async function assertRepoExists(repoPath: string): Promise<void> {
  try {
    await access(repoPath, fsConstants.R_OK);
  } catch {
    throw new Error(`repo path does not exist or is not readable: ${repoPath}`);
  }
}

export async function loadLaneTodoFile(paths: LanePaths, laneId: string): Promise<LaneTodoFile> {
  const todoPath = getLaneTodoPath(paths, laneId);
  try {
    const parsed = parseLaneTodoFile(await readJsonFile(todoPath));
    if (!parsed.success) {
      throw new Error(formatIssues(`invalid lane todo file at ${todoPath}`, parsed.issues));
    }
    return parsed.data;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {laneId, todos: []};
    }
    throw error;
  }
}

export async function saveLaneTodoFile(paths: LanePaths, todoFile: LaneTodoFile): Promise<void> {
  await ensureLaneHome(paths);
  await writeJsonFile(getLaneTodoPath(paths, todoFile.laneId), todoFile);
}

export async function loadLaneRuntimeState(paths: LanePaths, laneId: string): Promise<LaneRuntimeState | null> {
  const runtimePath = getLaneRuntimePath(paths, laneId);
  try {
    const parsed = parseLaneRuntimeState(await readJsonFile(runtimePath));
    if (!parsed.success) {
      throw new Error(formatIssues(`invalid lane runtime file at ${runtimePath}`, parsed.issues));
    }
    return parsed.data;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function saveLaneRuntimeState(paths: LanePaths, runtimeState: LaneRuntimeState): Promise<void> {
  await ensureLaneHome(paths);
  await writeJsonFile(getLaneRuntimePath(paths, runtimeState.laneId), runtimeState);
}

export async function loadLaneEventLog(paths: LanePaths, laneId: string): Promise<LaneEventLog> {
  const eventPath = getLaneEventPath(paths, laneId);
  try {
    const parsed = parseLaneEventLog(await readJsonFile(eventPath));
    if (!parsed.success) {
      throw new Error(formatIssues(`invalid lane event log at ${eventPath}`, parsed.issues));
    }
    return parsed.data;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {laneId, events: []};
    }
    throw error;
  }
}

export async function saveLaneEventLog(paths: LanePaths, eventLog: LaneEventLog): Promise<void> {
  await ensureLaneHome(paths);
  await writeJsonFile(getLaneEventPath(paths, eventLog.laneId), eventLog);
}

export function getDefaultLanePaths(rootPath = getDefaultLaneHome()): LanePaths {
  return {
    rootPath,
    configPath: resolve(rootPath, "lanes.json"),
    settingsPath: resolve(rootPath, "settings.json"),
    runtimeDirectoryPath: resolve(rootPath, "state/runtime"),
    todosDirectoryPath: resolve(rootPath, "state/todos"),
    contextDirectoryPath: resolve(rootPath, "context"),
    eventsDirectoryPath: resolve(rootPath, "state/events"),
  };
}

export function getLaneTodoPath(paths: LanePaths, laneId: string): string {
  return resolve(paths.todosDirectoryPath, `${laneId}.json`);
}

export function getLaneRuntimePath(paths: LanePaths, laneId: string): string {
  return resolve(paths.runtimeDirectoryPath, `${laneId}.json`);
}

export function getLaneContextPath(paths: LanePaths, laneId: string): string {
  return resolve(paths.contextDirectoryPath, `${laneId}.md`);
}

export function getLaneEventPath(paths: LanePaths, laneId: string): string {
  return resolve(paths.eventsDirectoryPath, `${laneId}.json`);
}

export function getDefaultLaneHome(): string {
  const override = process.env.PI_LANES_HOME;
  return override && override.trim().length > 0 ? override : resolve(homedir(), ".config/pi-lanes");
}

function formatIssues(summary: string, issues: ReadonlyArray<{readonly path: string; readonly message: string}>): string {
  return `${summary}\n${issues.map(issue => `- ${issue.path}: ${issue.message}`).join("\n")}`;
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
