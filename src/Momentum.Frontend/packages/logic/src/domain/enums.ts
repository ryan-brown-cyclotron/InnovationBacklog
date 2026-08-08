/**
 * Vocabulary the wire carries as bare `string`.
 *
 * Every one of these is a C# enum serialized by name. Narrowing them here is what
 * turns a whole class of provider bug into a compile error: the SharePoint provider
 * branches on adoption statuses `Building`, `Integrating` and `Completed`, none of
 * which `SolutionUseStatus` has ever contained, and nothing caught it.
 *
 * Keep these in step with the domain enums:
 *   src/Momentum.Library/Momentum.Library.Domain/**
 */

/** `Momentum.Library.Domain.Requests.RequestStatus`. */
export type IdeaStatus =
  | "Draft"
  | "Created"
  | "TriageRunning"
  | "AwaitingApproval"
  | "Accepted"
  | "Rejected"
  | "TriageFailed"
  | "PublicationFailed"
  | "ProjectionFailed";

/** `Momentum.Library.Domain.Requests.RequestType`. */
export type IdeaKind = "Backlog" | "Solution";

/** `Momentum.Library.Domain.Solutions.SolutionStatus`. */
export type SolutionStatus =
  | "AwaitingApproval"
  | "Published"
  | "Rejected"
  | "Retired"
  | "ProjectionFailed";

/**
 * What kind of thing a solution is.
 *
 * Deliberately coarse. The old taxonomy (Library / Service / Template /
 * Application / Pattern / Other) described the artefact but told the intake form
 * nothing useful — every one of them was asked for a repository. These two differ
 * in what they actually consist of, which is the only distinction the form needs:
 * a strategy has no repository, a custom solution does.
 *
 * The finer classification is still expressible, as ordinary topic tags.
 * See SOLUTION_KINDS in domain/solution.ts for what each kind requires.
 */
export type SolutionKind = "Strategy" | "CustomSolution";

/**
 * `Momentum.Library.Domain.Engagement.SolutionUseStatus`.
 * Exploring and Implementing are active; Using is the settled end state.
 */
export type AdoptionStatus = "Exploring" | "Implementing" | "Using";

/** `Momentum.Library.Domain.Engagement.ContributionStatus`. */
export type ParticipationStatus = "Proposed" | "Accepted" | "Rejected" | "Withdrawn";

/** `Momentum.Library.Domain.Engagement.RequestSolutionRelationship`. */
export type LinkRelationship = "Proposed" | "Relevant" | "Existing";

/** `Momentum.Library.Domain.Visibility.ApprovalState`. */
export type ApprovalState = "Pending" | "Approved" | "Rejected";

/** `Momentum.Library.Domain.Visibility.ItemVisibility`. */
export type ItemVisibility = "Everyone" | "Approvers" | "Hidden";

/** `Momentum.Library.Domain.Identity.Role`. */
export type Role = "Submitter" | "Approver" | "Administrator";

/** `Momentum.Library.Domain.Auditing.AuditActorType`. */
export type ActorType = "User" | "Agent" | "System";

/** Which side of the hub an engagement record points at. */
export type HubItemType = "Idea" | "Solution";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Adoptions that have not settled yet. Mirrors `SolutionUse.IsActive`. */
export const ACTIVE_ADOPTION_STATUSES: readonly AdoptionStatus[] = ["Exploring", "Implementing"];

export function isActiveAdoption(status: AdoptionStatus): boolean {
  return ACTIVE_ADOPTION_STATUSES.includes(status);
}

/** Approvers and administrators both review; both must see what is waiting. */
export function canReview(role: Role): boolean {
  return role === "Approver" || role === "Administrator";
}

/** Only administrators decide who can see what. */
export function canChangeVisibility(role: Role): boolean {
  return role === "Administrator";
}

/**
 * Whether `role` may see an item at this visibility.
 *
 * `isOwner` is the person who shared it, who keeps sight of their own work up to
 * the point an administrator hides it outright. Mirrors `ItemVisibilityRules.CanSee`.
 *
 * NOTE: the Azure DevOps adapter cannot honour the owner exception — area-path ACLs
 * have no such concept, so a restricted item never reaches its author at all. This
 * function stays correct for the in-memory and HTTP providers; the ADO provider is
 * knowingly stricter. See the accepted parity gap in scripts/provisioning/README.md.
 */
export function canSee(visibility: ItemVisibility, role: Role, isOwner: boolean): boolean {
  switch (visibility) {
    case "Everyone":
      return true;
    case "Approvers":
      return isOwner || canReview(role);
    case "Hidden":
      return role === "Administrator";
    default:
      return false;
  }
}
