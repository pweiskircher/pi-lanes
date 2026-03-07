// pattern: Imperative Shell

import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {basename, dirname, join} from "node:path";
import {randomUUID} from "node:crypto";

export async function readJsonFile(path: string): Promise<unknown> {
  const content = await readFile(path, "utf8");
  return JSON.parse(content) as unknown;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeAtomically(path, JSON.stringify(value, null, 2) + "\n");
}

export async function readTextFile(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await writeAtomically(path, content);
}

async function writeAtomically(path: string, content: string): Promise<void> {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, {recursive: true});

  const temporaryPath = join(directoryPath, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}
