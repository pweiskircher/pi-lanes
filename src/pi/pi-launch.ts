// pattern: Imperative Shell

import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";

export type LaunchPiOptions = {
  readonly cwd: string;
  readonly continueSession: boolean;
  readonly initialMessages: ReadonlyArray<string>;
  readonly extensionPaths: ReadonlyArray<string>;
  readonly skillPaths: ReadonlyArray<string>;
  readonly environment: NodeJS.ProcessEnv;
};

export async function ensurePiExists(): Promise<void> {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    throw new Error("PATH is not set; cannot locate pi executable");
  }

  const directories = pathValue.split(":");
  for (const directory of directories) {
    try {
      await access(`${directory}/pi`, fsConstants.X_OK);
      return;
    } catch {
      continue;
    }
  }

  throw new Error("could not find `pi` on PATH");
}

export async function launchPi(options: LaunchPiOptions): Promise<number> {
  const args = options.continueSession ? ["-c", "--session-control"] : ["--session-control"];

  for (const extensionPath of options.extensionPaths) {
    args.push("--extension", extensionPath);
  }
  for (const skillPath of options.skillPaths) {
    args.push("--skill", skillPath);
  }

  args.push(...options.initialMessages);

  return await new Promise<number>((resolve, reject) => {
    const child = spawn("pi", args, {
      cwd: options.cwd,
      stdio: "inherit",
      env: options.environment,
    });

    child.on("error", error => {
      reject(error);
    });

    child.on("exit", code => {
      resolve(code ?? 1);
    });
  });
}
