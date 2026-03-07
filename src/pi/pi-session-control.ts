// pattern: Imperative Shell

import net from "node:net";
import {promises as fs, type Dirent} from "node:fs";
import {homedir} from "node:os";
import {basename, join, resolve} from "node:path";
import type {Lane} from "../types.js";

const CONTROL_DIR = resolve(homedir(), ".pi", "session-control");
const SESSION_DIR = resolve(homedir(), ".pi", "agent", "sessions");
const SOCKET_SUFFIX = ".sock";
const ALIAS_SUFFIX = ".alias";

export type PiSessionMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: string | null;
};

export type PiControlledSession = {
  readonly sessionId: string;
  readonly name: string | null;
  readonly aliases: ReadonlyArray<string>;
  readonly cwd: string | null;
  readonly isIdle: boolean | null;
  readonly lastUser: string | null;
  readonly lastAssistant: string | null;
  readonly recentMessages: ReadonlyArray<PiSessionMessage>;
};

export async function findLaneControlledSession(lane: Lane): Promise<PiControlledSession | null> {
  const sessions = await getControlledSessions();
  const nameMatches = sessions.filter(session => session.name === lane.sessionName || session.aliases.includes(lane.sessionName));
  if (nameMatches.length === 1) {
    return nameMatches[0] ?? null;
  }
  const cwdMatches = sessions.filter(session => session.cwd === lane.repoPath);
  if (cwdMatches.length === 1) {
    return cwdMatches[0] ?? null;
  }
  return await findLatestLaneSessionFromFiles(lane);
}

async function getControlledSessions(): Promise<ReadonlyArray<PiControlledSession>> {
  const sockets = await getLiveSockets();
  return await Promise.all(sockets.map(async socket => await hydrateSocket(socket)));
}

async function getLiveSockets(): Promise<ReadonlyArray<{readonly sessionId: string; readonly socketPath: string; readonly name: string | null; readonly aliases: ReadonlyArray<string>}>> {
  const entries = await safeReadDir(CONTROL_DIR);
  const aliasMap = await getAliasMap();
  const sessions: Array<{readonly sessionId: string; readonly socketPath: string; readonly name: string | null; readonly aliases: ReadonlyArray<string>}> = [];

  for (const entry of entries) {
    if (!entry.isSocket() && !entry.name.endsWith(SOCKET_SUFFIX)) {
      continue;
    }
    if (!entry.name.endsWith(SOCKET_SUFFIX)) {
      continue;
    }
    const socketPath = join(CONTROL_DIR, entry.name);
    if (!(await isSocketAlive(socketPath))) {
      continue;
    }
    const sessionId = basename(entry.name, SOCKET_SUFFIX);
    const aliases = aliasMap.get(socketPath) ?? [];
    sessions.push({sessionId, socketPath, name: aliases[0] ?? null, aliases});
  }

  return sessions;
}

async function hydrateSocket(socket: {readonly sessionId: string; readonly socketPath: string; readonly name: string | null; readonly aliases: ReadonlyArray<string>}): Promise<PiControlledSession> {
  const infoResult = await sendRpc(socket.socketPath, {type: "get_info"}, 1500);
  const statusResult = await sendRpc(socket.socketPath, {type: "get_status"}, 1500);
  const info = infoResult.ok && isRecord(infoResult.data) ? infoResult.data : {};
  const status = statusResult.ok && isRecord(statusResult.data) ? statusResult.data : {};
  const cwd = readString(info.cwd) ?? readString(status.cwd);
  const recentMessages = cwd ? await readRecentMessages(socket.sessionId, cwd, 10) : [];

  return {
    sessionId: socket.sessionId,
    name: socket.name,
    aliases: socket.aliases,
    cwd,
    isIdle: readBoolean(status.isIdle),
    lastUser: readMessageContent(status.lastUser),
    lastAssistant: readMessageContent(status.lastAssistant),
    recentMessages,
  };
}

async function getAliasMap(): Promise<Map<string, Array<string>>> {
  const entries = await safeReadDir(CONTROL_DIR);
  const aliasMap = new Map<string, Array<string>>();

  for (const entry of entries) {
    if (!entry.isSymbolicLink() || !entry.name.endsWith(ALIAS_SUFFIX)) {
      continue;
    }
    const aliasPath = join(CONTROL_DIR, entry.name);
    try {
      const target = await fs.readlink(aliasPath);
      const resolvedTarget = resolve(CONTROL_DIR, target);
      const aliasName = basename(entry.name, ALIAS_SUFFIX);
      const aliases = aliasMap.get(resolvedTarget) ?? [];
      aliases.push(aliasName);
      aliasMap.set(resolvedTarget, aliases);
    } catch {
      continue;
    }
  }

  return aliasMap;
}

async function isSocketAlive(socketPath: string): Promise<boolean> {
  return await new Promise(resolvePromise => {
    const socket = net.createConnection(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolvePromise(false);
    }, 250);

    const finish = (alive: boolean) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      resolvePromise(alive);
    };

    socket.once("connect", () => {
      socket.end();
      finish(true);
    });
    socket.once("error", () => finish(false));
  });
}

async function sendRpc(socketPath: string, command: Record<string, unknown>, timeoutMs: number): Promise<{readonly ok: boolean; readonly data?: unknown; readonly error?: string}> {
  return await new Promise(resolvePromise => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise({ok: false, error: "timeout"});
    }, timeoutMs);

    const finish = (result: {readonly ok: boolean; readonly data?: unknown; readonly error?: string}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.end();
      resolvePromise(result);
    };

    socket.once("error", error => finish({ok: false, error: error.message}));
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          try {
            const payload = JSON.parse(line) as Record<string, unknown>;
            if (payload.type === "response") {
              const error = readString(payload.error);
              finish(error === null ? {ok: payload.success === true, data: payload.data} : {ok: payload.success === true, data: payload.data, error});
              return;
            }
          } catch {
            // ignore malformed lines
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    });
    socket.once("connect", () => {
      socket.write(`${JSON.stringify(command)}\n`);
    });
  });
}

async function readRecentMessages(sessionId: string, cwd: string, limit: number): Promise<ReadonlyArray<PiSessionMessage>> {
  const sessionFile = await findSessionFile(sessionId, cwd);
  if (!sessionFile) {
    return [];
  }
  return await readRecentMessagesFromFile(sessionFile, limit);
}

async function readRecentMessagesFromFile(filePath: string, limit: number): Promise<ReadonlyArray<PiSessionMessage>> {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split("\n").filter(line => line.trim().length > 0);
  const messages: Array<PiSessionMessage> = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type !== "message" || !isRecord(entry.message)) {
        continue;
      }
      const message = entry.message;
      const role = message.role;
      if (role !== "user" && role !== "assistant") {
        continue;
      }
      const formatted = formatSessionMessage(message);
      if (!formatted) {
        continue;
      }
      messages.push({
        role,
        content: formatted,
        timestamp: readNumber(message.timestamp) ? new Date(readNumber(message.timestamp) ?? 0).toISOString() : null,
      });
    } catch {
      continue;
    }
  }

  return messages.slice(-limit);
}

async function findSessionFile(sessionId: string, cwd: string): Promise<string | null> {
  const directory = join(SESSION_DIR, encodeWorkspacePath(cwd));
  const entries = await safeReadDir(directory);
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(".jsonl"));

  for (const entry of files) {
    const filePath = join(directory, entry.name);
    const header = await readSessionHeader(filePath);
    if (header?.id === sessionId) {
      return filePath;
    }
  }

  return null;
}

async function findLatestLaneSessionFromFiles(lane: Lane): Promise<PiControlledSession | null> {
  const directory = join(SESSION_DIR, encodeWorkspacePath(lane.repoPath));
  const entries = await safeReadDir(directory);
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map(async entry => {
        const filePath = join(directory, entry.name);
        try {
          const stat = await fs.stat(filePath);
          return {filePath, mtimeMs: stat.mtimeMs};
        } catch {
          return null;
        }
      }),
  );

  const latest = files.filter((value): value is {readonly filePath: string; readonly mtimeMs: number} => value !== null).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!latest) {
    return null;
  }

  const header = await readSessionHeader(latest.filePath);
  if (!header?.id) {
    return null;
  }
  const recentMessages = await readRecentMessagesFromFile(latest.filePath, 10);
  return {
    sessionId: header.id,
    name: lane.sessionName,
    aliases: [lane.sessionName],
    cwd: lane.repoPath,
    isIdle: null,
    lastUser: [...recentMessages].reverse().find(message => message.role === "user")?.content ?? null,
    lastAssistant: [...recentMessages].reverse().find(message => message.role === "assistant")?.content ?? null,
    recentMessages,
  };
}

async function readSessionHeader(filePath: string): Promise<{readonly id: string} | null> {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const firstLineBuffer = Buffer.alloc(2048);
      const {bytesRead} = await handle.read(firstLineBuffer, 0, firstLineBuffer.length, 0);
      const firstChunk = firstLineBuffer.subarray(0, bytesRead).toString("utf8");
      const firstLine = firstChunk.split("\n", 1)[0] ?? "";
      const header = JSON.parse(firstLine) as Record<string, unknown>;
      if (header.type === "session" && typeof header.id === "string") {
        return {id: header.id};
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

function formatSessionMessage(message: Record<string, unknown>): string | null {
  const role = message.role;
  if (role === "user") {
    if (typeof message.content === "string") {
      return message.content.trim() || null;
    }
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter(isRecord)
        .filter(part => part.type === "text")
        .map(part => readString(part.text))
        .filter((part): part is string => typeof part === "string")
        .join("\n")
        .trim();
      return text.length > 0 ? text : null;
    }
    return null;
  }

  if (role === "assistant") {
    const content = Array.isArray(message.content) ? message.content : [];
    const text = content
      .filter(isRecord)
      .filter(part => part.type === "text")
      .map(part => readString(part.text))
      .filter((part): part is string => typeof part === "string")
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  }

  return null;
}

function encodeWorkspacePath(workspacePath: string): string {
  const normalized = workspacePath.replace(/^\/+/, "").replaceAll("/", "-");
  return `--${normalized}--`;
}

async function safeReadDir(directory: string): Promise<ReadonlyArray<Dirent>> {
  try {
    return await fs.readdir(directory, {withFileTypes: true});
  } catch {
    return [];
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readMessageContent(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  return readString(value.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
