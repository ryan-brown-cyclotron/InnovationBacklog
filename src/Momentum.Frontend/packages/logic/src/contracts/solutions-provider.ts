import type { PageResult } from "../domain/common.js";
import type { ItemVisibility } from "../domain/enums.js";
import type {
  CreateSolutionIssueInput,
  SolutionIssue,
  UpdateSolutionIssueInput,
} from "../domain/feedback.js";
import type { Idea } from "../domain/idea.js";
import type {
  CreateMilestoneInput,
  Milestone,
  UpdateMilestoneInput,
} from "../domain/roadmap.js";
import type { RollupMap, SolutionRollup } from "../domain/search.js";
import type {
  CreateSolutionInput,
  Solution,
  SolutionQuery,
  UpdateSolutionInput,
} from "../domain/solution.js";

/**
 * Problems raised by the people using a solution.
 *
 * A capability, not a convenience: absent means the backing store has no issue type,
 * and the whole Issues surface hides rather than showing an empty tab that implies
 * nobody has reported anything.
 */
export interface SolutionIssuesProvider {
  listIssues(solutionId: string): Promise<SolutionIssue[]>;
  createIssue(solutionId: string, input: CreateSolutionIssueInput): Promise<SolutionIssue>;
  updateIssue(
    solutionId: string,
    issueId: string,
    patch: UpdateSolutionIssueInput,
  ): Promise<SolutionIssue>;
}

/** The solution owner's published plan. Same capability contract as issues. */
export interface SolutionRoadmapProvider {
  listMilestones(solutionId: string): Promise<Milestone[]>;
  createMilestone(solutionId: string, input: CreateMilestoneInput): Promise<Milestone>;
  updateMilestone(
    solutionId: string,
    milestoneId: string,
    patch: UpdateMilestoneInput,
  ): Promise<Milestone>;
  /**
   * Drops the milestone off the roadmap.
   *
   * Implementations may do this by moving it to `Cancelled` rather than destroying
   * the record — the Azure DevOps adapter has no DELETE verb available to it — so
   * callers must not assume the id stops resolving.
   */
  deleteMilestone(solutionId: string, milestoneId: string): Promise<void>;
}

export interface SolutionsProvider {
  listSolutions(query?: SolutionQuery): Promise<PageResult<Solution>>;

  /** Null when absent or invisible — see the note on `IdeasProvider.getIdea`. */
  getSolution(id: string): Promise<Solution | null>;

  createSolution(input: CreateSolutionInput): Promise<Solution>;

  /**
   * Correct a shared entry's description or tags. Owner or reviewer — `canEditSolution`.
   *
   * Required, not a capability, for the same reason `updateIdea` is: a catalog you
   * cannot correct is a defect rather than a missing feature. Implementations must
   * reject an unauthorized caller rather than silently no-op, because a save that
   * reports success and changes nothing is worse than one that fails.
   */
  updateSolution(id: string, patch: UpdateSolutionInput): Promise<Solution>;

  /** Ideas this solution is linked to, filtered to links the caller may see. */
  listLinkedIdeas(solutionId: string): Promise<Idea[]>;

  /** Batch rollups keyed by solution id. See `IdeasProvider.getIdeaRollups`. */
  getSolutionRollups(ids?: string[]): Promise<RollupMap<SolutionRollup>>;

  /** Administrator-only. */
  setSolutionVisibility?(id: string, visibility: ItemVisibility): Promise<Solution>;

  /** Absent when the backing store has no issue type. Gates the Issues tab. */
  issues?: SolutionIssuesProvider;

  /** Absent when the backing store has no milestone type. Gates the Roadmap. */
  roadmap?: SolutionRoadmapProvider;
}
