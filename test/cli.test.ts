import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const cliPath = resolve(repoRoot, "bin/pi-lane.mjs");

test("pi-lane list executes instead of falling back to help", async () => {
  const cwd = await createTempLaneRepo();
  const result = await execFileAsync("node", [cliPath, "list"], {cwd});

  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), "");
});

test("pi-lane doctor --json returns structured output", async () => {
  const cwd = await createTempLaneRepo();
  const result = await execFileAsync("node", [cliPath, "doctor", "--json"], {cwd});
  const parsed = JSON.parse(result.stdout);

  assert.equal(typeof parsed.ok, "boolean");
  assert.equal(typeof parsed.piAvailable, "boolean");
  assert.equal(parsed.laneCount, 0);
  assert.ok(Array.isArray(parsed.warnings));
});

test("pi-lane new creates a lane that list --json can see", async () => {
  const cwd = await createTempLaneRepo();
  const workspacePath = join(cwd, "workspaces", "mt-core");
  const repoPath = join(cwd, "repo");
  await mkdir(workspacePath, {recursive: true});
  await mkdir(repoPath, {recursive: true});

  await execFileAsync(
    "node",
    [
      cliPath,
      "new",
      "mt-core",
      "--title",
      "Multithreading large subsystem",
      "--workspace",
      workspacePath,
      "--repo",
      repoPath,
      "--bookmark",
      "pat/mt-core",
      "--port",
      "3001",
    ],
    {cwd},
  );

  const result = await execFileAsync("node", [cliPath, "list", "--json"], {cwd});
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.lanes.length, 1);
  assert.equal(parsed.lanes[0].id, "mt-core");
});

async function createTempLaneRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-lanes-cli-"));
  await mkdir(join(cwd, "config"), {recursive: true});
  await mkdir(join(cwd, "state", "runtime"), {recursive: true});
  await mkdir(join(cwd, "state", "todos"), {recursive: true});
  await writeFile(join(cwd, "config", "lanes.json"), "[]\n", "utf8");
  return cwd;
}
