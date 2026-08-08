import type { PageResult } from "../domain/common.js";
import type { ItemVisibility } from "../domain/enums.js";
import type { Idea } from "../domain/idea.js";
import type { RollupMap, SolutionRollup } from "../domain/search.js";
import type {
  CreateSolutionInput,
  Solution,
  SolutionQuery,
} from "../domain/solution.js";

export interface SolutionsProvider {
  listSolutions(query?: SolutionQuery): Promise<PageResult<Solution>>;

  /** Null when absent or invisible — see the note on `IdeasProvider.getIdea`. */
  getSolution(id: string): Promise<Solution | null>;

  createSolution(input: CreateSolutionInput): Promise<Solution>;

  /** Ideas this solution is linked to, filtered to links the caller may see. */
  listLinkedIdeas(solutionId: string): Promise<Idea[]>;

  /** Batch rollups keyed by solution id. See `IdeasProvider.getIdeaRollups`. */
  getSolutionRollups(ids?: string[]): Promise<RollupMap<SolutionRollup>>;

  /** Administrator-only. */
  setSolutionVisibility?(id: string, visibility: ItemVisibility): Promise<Solution>;
}
