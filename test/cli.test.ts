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
  const laneHome = await createTempLaneHome();
  const result = await execCli(laneHome, ["list"]);

  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), "");
});

test("pi-lane doctor --json returns structured output", async () => {
  const laneHome = await createTempLaneHome();
  const result = await execCli(laneHome, ["doctor", "--json"]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(typeof parsed.ok, "boolean");
  assert.equal(typeof parsed.piAvailable, "boolean");
  assert.equal(parsed.laneCount, 0);
  assert.ok(Array.isArray(parsed.warnings));
});

test("pi-lane new creates a lane that list --json can see", async () => {
  const laneHome = await createTempLaneHome();
  const repoPath = join(laneHome, "repo");
  await mkdir(repoPath, {recursive: true});

  await execCli(laneHome, [
    "new",
    "--id",
    "mt-core",
    "--title",
    "Multithreading large subsystem",
    "--repo",
    repoPath,
    "--bookmark",
    "pat/mt-core",
  ]);

  const result = await execCli(laneHome, ["list", "--json"]);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.lanes.length, 1);
  assert.equal(parsed.lanes[0].id, "mt-core");
  assert.equal(parsed.lanes[0].repoPath, repoPath);
});

async function execCli(laneHome: string, args: ReadonlyArray<string>) {
  return await execFileAsync("node", [cliPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PI_LANES_HOME: laneHome,
    },
  });
}

async function createTempLaneHome(): Promise<string> {
  const laneHome = await mkdtemp(join(tmpdir(), "pi-lanes-home-"));
  await mkdir(join(laneHome, "state", "runtime"), {recursive: true});
  await mkdir(join(laneHome, "state", "todos"), {recursive: true});
  await mkdir(join(laneHome, "context"), {recursive: true});
  await writeFile(join(laneHome, "lanes.json"), "[]\n", "utf8");
  return laneHome;
}
