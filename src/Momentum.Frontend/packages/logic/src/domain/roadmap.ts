/**
 * What a solution's owner has committed to next.
 *
 * A roadmap is a claim about the future, so it is authored, not derived. That makes
 * it a different thing from the "milestones" in docs/design/capabilities/momentum —
 * those are achievement thresholds crossed by events ("ten adoptions") and are
 * correctly derived rather than stored. This one is a plan, and nothing can derive
 * a plan.
 *
 * The record is an Azure DevOps `Milestone` work item parented to the Solution.
 *
 * NO WIRE COUNTERPART, BY DESIGN — see the same note in feedback.ts.
 */

/**
 * `InProgress` has no space; the Azure DevOps state name does ("In progress").
 *
 * The adapter owns that mapping. A domain union with a space in it reads badly at
 * every call site and invites `status === "In Progress"` typos that the compiler
 * cannot distinguish from a real state.
 */
export type MilestoneStatus = "Planned" | "InProgress" | "Shipped" | "Cancelled";

/** Roadmap order, and the order the status control offers. Cancelled is not offered. */
export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "Planned",
  "InProgress",
  "Shipped",
];

export interface Milestone {
  id: string;
  solutionId: string;
  title: string;
  /** One line of context. `System.Description` — no custom field for it. */
  note: string;
  status: MilestoneStatus;
  /**
   * Sortable anchor: the first day of the target period, ISO 8601. Null when unset.
   *
   * Stored alongside {@link targetLabel} rather than instead of it because a date
   * cannot express granularity — "Q4 2026" is a quarter and "Sep 2026" is a month,
   * and no instant distinguishes them. This orders the timeline; the label prints.
   */
  targetDate: string | null;
  /** What the roadmap prints: "Q4 2026". Empty means format {@link targetDate}. */
  targetLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneInput {
  title: string;
  note?: string;
  targetDate?: string | null;
  targetLabel?: string;
  status?: MilestoneStatus;
}

export interface UpdateMilestoneInput {
  title?: string;
  note?: string;
  /** `null` clears the date; `undefined` leaves it alone. */
  targetDate?: string | null;
  targetLabel?: string;
  status?: MilestoneStatus;
}

/**
 * Roadmap order: by target, undated last, then by title.
 *
 * Undated milestones sort last rather than first because "no date yet" is further out
 * than anything with one — a plan nobody has committed to a period for is the least
 * imminent thing on the list, not the most.
 */
export function compareMilestones(a: Milestone, b: Milestone): number {
  if (a.targetDate && b.targetDate) {
    const delta = a.targetDate.localeCompare(b.targetDate);
    if (delta !== 0) return delta;
  } else if (a.targetDate) {
    return -1;
  } else if (b.targetDate) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}
