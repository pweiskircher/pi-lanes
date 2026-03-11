// pattern: Functional Core

import type {Lane} from "../types.js";

export function formatInitialLaneContext(lane: Lane): string {
  return [
    `# ${lane.id}`,
    "",
    "Purpose:",
    "- Describe what this lane is for.",
    "- Describe the current desired outcome.",
    "",
    "Classification:",
    "- feature | bug | investigation | cleanup | mixed/ongoing",
    "",
    "Current status:",
    "- setup only for now | active task | blocked | other",
    "",
    "Constraints:",
    "- Add lane-specific rules, references, or reminders here.",
    "",
    "References:",
    "- Repo:",
    "- Ticket/issue:",
    "- Branch/PR/commit:",
    "- Key files/dirs:",
    "- Useful commands/docs:",
    "",
    "Next:",
    "- Capture the next concrete step or decision.",
    "",
  ].join("\n");
}

export function needsLaneOnboarding(options: {readonly lane: Lane; readonly laneContext: string | null}): boolean {
  const {lane, laneContext} = options;
  if (laneContext === null) {
    return true;
  }

  const normalizedContext = normalizeLaneContextText(laneContext);
  if (normalizedContext.length === 0) {
    return true;
  }

  return normalizedContext === normalizeLaneContextText(formatInitialLaneContext(lane));
}

function normalizeLaneContextText(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}
