import type { MaybeUnavailable } from "../domain/common.js";
import type { IdeaSolutionLink } from "../domain/engagement.js";
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
   * Assert that a solution answers an idea.
   *
   * Reviewers only. That restriction is what lets the link be a plain Azure DevOps
   * `Related` link with no attributes: there is no proposal to hold pending, and
   * therefore no approval state and no relationship taxonomy to record.
   *
   * Idempotent — linking the same pair twice returns the existing link.
   */
  linkSolution(ideaId: string, solutionId: string): Promise<IdeaSolutionLink>;
  unlinkSolution(ideaId: string, solutionId: string): Promise<void>;

  /** Marks one linked solution as the canonical answer to an idea. */
  selectCanonicalSolution(ideaId: string, solutionId: string): Promise<Idea>;
}
