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

// Type-only, and no cycle: feedback.ts imports nothing from here.
import type { SolutionIssueStatus } from "./feedback.js";

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
 *
 * `Skill` is modelled but not offered: it exists here, in the ADO picklist and in
 * `Momentum.Library.Domain.Solutions.SolutionType`, and `SOLUTION_KINDS` marks it
 * `hidden` so the intake picker does not render it. A skill's repository folder is
 * created by skill intake rather than named by whoever fills in the form, so the
 * form has nothing coherent to ask for until that path is wired to this one.
 */
export type SolutionKind = "Strategy" | "CustomSolution" | "Skill";

/**
 * `Momentum.Library.Domain.Engagement.SolutionUseStatus`.
 *
 * Exploring and Implementing are active; Using is the settled end state; Withdrawn is
 * the tombstone — "we stopped using it", or "I clicked this by mistake".
 *
 * Withdrawn is a status rather than a delete for the same reason `deleteMilestone`
 * writes a Cancelled state rather than removing the work item: a real delete silently
 * changes every historical rollup that counted the row. It also mirrors
 * `ParticipationStatus.Withdrawn` next door, which is the same act on the same kind of
 * record.
 */
export type AdoptionStatus = "Exploring" | "Implementing" | "Using" | "Withdrawn";

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

/**
 * Adoptions that have not settled yet. Mirrors `SolutionUse.IsActive`.
 *
 * Withdrawn is deliberately absent, and is not merely "not active": a withdrawn
 * adoption is not counted at all. See `adoptionFacts` in dataverse/rollups.ts.
 */
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
 * Whether two user references are the same person.
 *
 * Both sides of every ownership comparison in this app are UPNs — `Solution.ownerId`
 * comes from `System.AssignedTo`'s uniqueName and `CurrentUser.id` from
 * `userPrincipalName` — but Entra and Azure DevOps do not agree on their casing, so
 * `Ryan.Brown@…` and `ryan.brown@…` are the same person spelled two ways. A bare
 * `===` silently hides every "this is mine" affordance for anyone whose two records
 * disagree.
 */
export function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

/**
 * Who may correct a catalog entry's description and tags, and author its roadmap.
 *
 * The owner, because they shared it and are the first to know when the description
 * stops being true; and reviewers, because a published entry is the catalog's claim
 * as much as its owner's.
 *
 * NOT A SECURITY BOUNDARY, unlike the two rules above it. Visibility is enforced by
 * an area-path ACL and decisions by an Azure DevOps process rule, so those two merely
 * predict what the server will do anyway. There is no equivalent for ownership: ADO
 * lets any project contributor edit any work item in an area they can write to, and a
 * process rule cannot express "the person named in AssignedTo". This gates the
 * affordance and the provider's own check, and nothing more.
 */
export function canEditSolution(role: Role, isOwner: boolean): boolean {
  return ownerOrReviewer(role, isOwner);
}

/**
 * Who may correct an idea's title, description and tags.
 *
 * Its author, and reviewers. The same predicate as `canEditSolution` over a different
 * subject, and kept as its own name for two reasons: `canEditSolution(role, isAuthor)`
 * at an idea call site reads as a copy-paste bug, and the two are free to diverge —
 * an idea's author loses nothing by an edit, whereas a published solution is the
 * catalog's claim as much as its owner's.
 *
 * Same caveat as `canEditSolution`: NOT A SECURITY BOUNDARY. It gates the affordance
 * and `requireIdeaEditor` in the Azure DevOps provider, and nothing beneath either,
 * because no ADO process rule can express "the person named in System.CreatedBy".
 */
export function canEditIdea(role: Role, isAuthor: boolean): boolean {
  return ownerOrReviewer(role, isAuthor);
}

/**
 * Who may change or withdraw one adoption row.
 *
 * The person who recorded it, and reviewers. **Deliberately narrower than
 * `canEditSolution`: the solution's OWNER is not included.** An adoption is somebody
 * else's report about their own team, so the owner of the thing being adopted has no
 * more standing to rewrite it than any other reader — even though they may edit every
 * other part of the solution. Reviewers are included because somebody has to be able
 * to clear a row whose author has left.
 *
 * Requires `Adoption.startedByMe` rather than a comparison the caller makes itself:
 * `startedBy` is a Dataverse systemuser GUID and `CurrentUser.id` is an Azure DevOps
 * UPN, so a call site holding those two values CANNOT determine `isStarter` and will
 * silently get `false` for the real adopter. The flag is resolved by the provider,
 * where both ids are GUIDs.
 */
export function canManageAdoption(role: Role, isStarter: boolean): boolean {
  return ownerOrReviewer(role, isStarter);
}

/** The shape `canEditSolution`, `canEditIdea` and `canManageAdoption` share. */
function ownerOrReviewer(role: Role, isOwner: boolean): boolean {
  return isOwner || canReview(role);
}

/**
 * Who may move a reported issue to `target`.
 *
 * Triage belongs to the solution's owner. "Doing" is a claim that the owner is
 * working on it, so only they can make it. What the reporter can do is withdraw their
 * own report or reopen it — those are claims about their own problem, and nobody is
 * better placed to make them.
 *
 * Same caveat as `canEditSolution`: not a security boundary. Azure DevOps will let
 * any contributor patch any state; this gates the affordance and the provider check.
 */
export function canSetIssueStatus(
  target: SolutionIssueStatus,
  role: Role,
  isSolutionOwner: boolean,
  isReporter: boolean,
): boolean {
  if (isSolutionOwner || canReview(role)) return true;
  return isReporter && target !== "Doing";
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
