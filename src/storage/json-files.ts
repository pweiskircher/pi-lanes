// pattern: Imperative Shell

import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

export async function readJsonFile(path: string): Promise<unknown> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as unknown;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function readTextFile(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, content, "utf8");
}
