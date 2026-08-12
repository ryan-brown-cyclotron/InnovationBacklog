import type { MilestoneStatus, SolutionIssueStatus } from "@innovation-backlog/logic";
import type { SolutionUse } from "../../types";

/**
 * One palette for every status pill in the solution modal.
 *
 * The design this replaces carried four separate colour tables — one each for
 * adoption status, issue state, milestone status and issue type — holding fourteen
 * hardcoded hex triples between them. Three of those tables described the same five
 * ideas in three vocabularies, and none of them referenced a design token, so a
 * change to the brand colour would have missed all of them.
 *
 * Here every status maps to one of five tones, and the tones are the tokens.
 */
export type Tone = "brand" | "success" | "warning" | "neutral" | "danger";

/** Not started, no commitment yet. */
const PLANNED: Tone = "neutral";
/** Someone is actively on it. */
const ACTIVE: Tone = "brand";
/** Reached the outcome the surface exists to show. */
const DONE: Tone = "success";

export function milestoneTone(status: MilestoneStatus): Tone {
  switch (status) {
    case "Shipped":
      return DONE;
    case "InProgress":
      return ACTIVE;
    case "Cancelled":
      return "danger";
    default:
      return PLANNED;
  }
}

export function issueTone(status: SolutionIssueStatus): Tone {
  switch (status) {
    case "Done":
      return DONE;
    case "Doing":
      return ACTIVE;
    default:
      return "warning";
  }
}

/**
 * An adoption's tone.
 *
 * A completed rollout reads as settled rather than as one more stage in progress,
 * which is why `completedAt` outranks the status string it is paired with.
 */
export function adoptionTone(use: Pick<SolutionUse, "status" | "completedAt">): Tone {
  if (use.completedAt) return DONE;
  return use.status === "Using" ? DONE : ACTIVE;
}

// -------------------------------------------------------------------------
// Display labels
// -------------------------------------------------------------------------

/**
 * Azure DevOps' Basic process names `Issue` states To Do / Doing / Done, and state
 * names are permanent once created. Renaming them here costs nothing and can change
 * without a migration; renaming them there could never be undone.
 */
const ISSUE_LABELS: Record<SolutionIssueStatus, string> = {
  "To Do": "Open",
  Doing: "In progress",
  Done: "Done",
};

export function issueStatusLabel(status: SolutionIssueStatus): string {
  return ISSUE_LABELS[status] ?? status;
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  Planned: "Planned",
  InProgress: "In progress",
  Shipped: "Shipped",
  Cancelled: "Cancelled",
};

export function milestoneStatusLabel(status: MilestoneStatus): string {
  return MILESTONE_LABELS[status] ?? status;
}

/**
 * "Sep 2026" from a target date, or the author's own label when they wrote one.
 *
 * The label wins because a date cannot express the granularity people plan in — a
 * milestone aimed at "Q4 2026" is not aimed at the first of October.
 *
 * Parsed as UTC and formatted as UTC. Formatting an ISO midnight in local time
 * renders "Sep 2026" as "Aug 2026" for every reader west of Greenwich.
 */
export function milestoneTargetLabel(
  targetLabel: string,
  targetDate: string | null,
): string {
  if (targetLabel.trim()) return targetLabel.trim();
  if (!targetDate) return "No date yet";

  const parsed = new Date(targetDate);
  if (Number.isNaN(parsed.getTime())) return "No date yet";

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
