// pattern: Imperative Shell

import {readdir} from "node:fs/promises";
import {resolve} from "node:path";

export async function hasSavedPiSessionForCwd(workspacePath: string): Promise<boolean> {
  const sessionDirectoryPath = resolve(getPiAgentHome(), "sessions", encodeWorkspacePath(workspacePath));

  try {
    const entries = await readdir(sessionDirectoryPath, {withFileTypes: true});
    return entries.some(entry => entry.isFile() && entry.name.endsWith(".jsonl"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function getPiAgentHome(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME is not set; cannot inspect pi session storage");
  }
  return resolve(home, ".pi/agent");
}

function encodeWorkspacePath(workspacePath: string): string {
  return `--${workspacePath.replaceAll("/", "-")}--`;
}
