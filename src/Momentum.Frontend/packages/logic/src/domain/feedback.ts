/**
 * Problems and requests raised by the people USING a solution.
 *
 * An inbound channel, not a delivery backlog. Anyone who can see a solution can file
 * one; triage belongs to the solution's owner. The record is an Azure DevOps `Issue`
 * work item parented to the Solution.
 *
 * NO WIRE COUNTERPART, BY DESIGN. There is no `SolutionIssueResponse` in
 * `src/Momentum.Contracts/Models.cs` and there will not be — no HTTP host serves
 * this. So there is deliberately no `Assert<FieldsExistOn<…>>` guard here: the guard
 * exists to catch a C# rename (see common.ts), and inventing a C# record purely to
 * satisfy it would be the tail wagging the dog. Every `*Input` type is already
 * unguarded for the same reason.
 */

/**
 * The states Azure DevOps' Basic process gives `Issue`, verbatim.
 *
 * Not renamed to Open/Active/Closed. These are the strings the store round-trips, and
 * a domain type that lied about them would need a translation table on both sides of
 * every read and write. The UI maps them to display labels, which costs nothing and
 * can change without a migration — state names in ADO are permanent.
 */
export type SolutionIssueStatus = "To Do" | "Doing" | "Done";

export const SOLUTION_ISSUE_STATUSES: readonly SolutionIssueStatus[] = [
  "To Do",
  "Doing",
  "Done",
];

/** Everything except the settled end state. What the "Open" filter shows. */
export function isOpenIssue(status: SolutionIssueStatus): boolean {
  return status !== "Done";
}

export interface SolutionIssue {
  id: string;
  /** The solution this was raised against. The work item's `System.Parent`. */
  solutionId: string;
  title: string;
  description: string;
  status: SolutionIssueStatus;
  /** `System.CreatedBy` uniqueName — a UPN, comparable to `CurrentUser.id`. */
  reportedBy: string;
  /** Resolved display name when the adapter could get one. */
  reportedByName?: string | null;
  /** `System.AssignedTo`. Null until someone picks it up. */
  assignedTo: string | null;
  assignedToName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSolutionIssueInput {
  title: string;
  description: string;
}

export interface UpdateSolutionIssueInput {
  title?: string;
  description?: string;
  status?: SolutionIssueStatus;
}
