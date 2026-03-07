// pattern: Imperative Shell

import {access} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import {resolve} from "node:path";
import {parseLaneRegistry, parseLaneRuntimeState, parseLaneTodoFile} from "../functional-core/validate-lane-data.js";
import type {Lane, LaneRegistry, LaneRuntimeState, LaneTodoFile} from "../types.js";
import {readJsonFile, writeJsonFile} from "./json-files.js";

export type LanePaths = {
  readonly rootPath: string;
  readonly configPath: string;
  readonly runtimeDirectoryPath: string;
  readonly todosDirectoryPath: string;
};

export async function loadLaneRegistry(paths: LanePaths): Promise<LaneRegistry> {
  const parsed = parseLaneRegistry(await readJsonFile(paths.configPath));
  if (!parsed.success) {
    throw new Error(formatIssues(`invalid lane registry at ${paths.configPath}`, parsed.issues));
  }
  return parsed.data;
}

export function getLaneById(lanes: LaneRegistry, laneId: string): Lane {
  const lane = lanes.find(candidate => candidate.id === laneId);
  if (!lane) {
    throw new Error(`unknown lane: ${laneId}`);
  }
  return lane;
}

export async function assertWorkspaceExists(workspacePath: string): Promise<void> {
  try {
    await access(workspacePath, fsConstants.R_OK);
  } catch {
    throw new Error(`workspace path does not exist or is not readable: ${workspacePath}`);
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
      return {
        laneId,
        todos: [],
      };
    }
    throw error;
  }
}

export async function saveLaneTodoFile(paths: LanePaths, todoFile: LaneTodoFile): Promise<void> {
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
  await writeJsonFile(getLaneRuntimePath(paths, runtimeState.laneId), runtimeState);
}

export function getDefaultLanePaths(rootPath: string): LanePaths {
  return {
    rootPath,
    configPath: resolve(rootPath, "config/lanes.json"),
    runtimeDirectoryPath: resolve(rootPath, "state/runtime"),
    todosDirectoryPath: resolve(rootPath, "state/todos"),
  };
}

export function getLaneTodoPath(paths: LanePaths, laneId: string): string {
  return resolve(paths.todosDirectoryPath, `${laneId}.json`);
}

export function getLaneRuntimePath(paths: LanePaths, laneId: string): string {
  return resolve(paths.runtimeDirectoryPath, `${laneId}.json`);
}

function formatIssues(summary: string, issues: ReadonlyArray<{readonly path: string; readonly message: string}>): string {
  return `${summary}\n${issues.map(issue => `- ${issue.path}: ${issue.message}`).join("\n")}`;
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
