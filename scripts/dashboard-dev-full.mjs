import {spawn} from "node:child_process";

const backendPort = "4310";
const frontendPort = "4311";

const backendProcess = spawn(
  process.execPath,
  ["bin/pi-lane.mjs", "dashboard", "serve", "--port", backendPort],
  {
    stdio: "inherit",
    env: process.env,
  },
);

const frontendProcess = spawn(
  "npm",
  ["--prefix", "dashboard-app", "run", "dev", "--", "--host", "127.0.0.1", "--port", frontendPort],
  {
    stdio: "inherit",
    env: process.env,
  },
);

let isShuttingDown = false;

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  backendProcess.kill("SIGTERM");
  frontendProcess.kill("SIGTERM");

  const forceKillTimer = setTimeout(() => {
    backendProcess.kill("SIGKILL");
    frontendProcess.kill("SIGKILL");
  }, 2_000);

  let remaining = 2;
  const handleExit = () => {
    remaining -= 1;
    if (remaining > 0) {
      return;
    }
    clearTimeout(forceKillTimer);
    process.exit(exitCode);
  };

  backendProcess.once("exit", handleExit);
  frontendProcess.once("exit", handleExit);
}

backendProcess.once("exit", code => {
  if (!isShuttingDown) {
    console.error(`dashboard backend exited with code ${code ?? 0}`);
    shutdown(code ?? 0);
  }
});

frontendProcess.once("exit", code => {
  if (!isShuttingDown) {
    console.error(`dashboard frontend exited with code ${code ?? 0}`);
    shutdown(code ?? 0);
  }
});

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
