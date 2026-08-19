import type { MaybeUnavailable } from "../domain/common.js";
import type { IdeaSolutionLink, PendingLink } from "../domain/engagement.js";
import type { Idea } from "../domain/idea.js";
import type { Solution } from "../domain/solution.js";

/** One recorded accept/reject, with the rationale that justified it. */
export interface Decision {
  id: string;
  subjectId: string;
  approverId: string;
  decision: "Accept" | "Reject";
  rationale: string;
  decidedAt: string;
}

/**
 * Everything waiting on a reviewer, in one call.
 *
 * `unavailable` rather than a throw when the caller lacks the privilege: an
 * approvals surface a submitter cannot use should render empty, not break the page
 * around it.
 */
export interface ApprovalInbox extends MaybeUnavailable {
  ideas: Idea[];
  solutions: Solution[];
}

export interface ApprovalsProvider {
  getInbox(): Promise<ApprovalInbox>;

  /**
   * Rationale is required by the domain, so it is a required argument here rather
   * than an optional one the caller can forget.
   */
  acceptIdea(id: string, rationale: string): Promise<Idea>;
  rejectIdea(id: string, rationale: string): Promise<Idea>;

  acceptSolution(id: string, rationale: string): Promise<Solution>;
  rejectSolution(id: string, rationale: string): Promise<Solution>;

  listDecisions(ideaId: string): Promise<Decision[]>;

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------

  /**
   * PROPOSE that a solution answers an idea. Open to anyone who can see both.
   *
   * Returns a link in `Pending`, and — this is the part that surprises people — creates
   * **nothing in Azure DevOps**. The `Related` link is written by `approveLink`. Until
   * then the proposal exists only as a Dataverse row, so `listLinkedSolutions` and every
   * other reader of ADO relations keeps showing approved links only, with no approval
   * filter of its own to get wrong.
   *
   * Idempotent — proposing the same pair twice returns the existing proposal rather than
   * queueing a second one for the same reviewer. Backed by a uniqueness constraint where
   * one is available, not a read-then-write check that two clicks can race past.
   */
  linkSolution(ideaId: string, solutionId: string): Promise<IdeaSolutionLink>;

  /**
   * Everything proposed and not yet decided, with both titles resolved.
   *
   * Reviewers only. Returns empty for anyone else rather than throwing, matching
   * `getInbox` — a queue a submitter cannot use should be absent, not an error.
   */
  listPendingLinks(): Promise<PendingLink[]>;

  /**
   * What has been proposed for ONE idea and not yet decided.
   *
   * Not reviewer-gated, unlike the queue above: proposing is open, so seeing what has
   * already been proposed has to be too, or two people race to suggest the same
   * solution. This is what stops a proposal from being invisible to the person who made
   * it — nothing is written to Azure DevOps until approval, so without this the idea
   * panel would look exactly as it did before they clicked.
   */
  listProposedLinks(ideaId: string): Promise<PendingLink[]>;

  /**
   * Approve a proposed link, and only here is the Azure DevOps `Related` link created.
   *
   * The ADO write is the point of the call, not a side effect: approval is what makes
   * the claim true, and ADO carries approved truth. Rationale is required, as it is for
   * every other decision.
   */
  approveLink(ideaId: string, solutionId: string, rationale: string): Promise<IdeaSolutionLink>;

  /** Reject a proposed link. No ADO link is created, then or ever. */
  rejectLink(ideaId: string, solutionId: string, rationale: string): Promise<IdeaSolutionLink>;

  /**
   * Remove an APPROVED link: the ADO relation goes, and the proposal returns to being
   * undecided so the pair can be proposed again.
   *
   * Owner of the solution, or a reviewer — narrower than proposing, because dropping
   * somebody else's approved claim leaves nothing behind but an activity row.
   */
  unlinkSolution(ideaId: string, solutionId: string): Promise<void>;

  /** Marks one linked solution as the canonical answer to an idea. */
  selectCanonicalSolution(ideaId: string, solutionId: string): Promise<Idea>;
}
