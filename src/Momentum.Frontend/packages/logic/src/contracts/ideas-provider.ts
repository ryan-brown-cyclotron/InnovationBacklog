import type { PageResult } from "../domain/common.js";
import type {
  CreateIdeaInput,
  Idea,
  IdeaQuery,
  UpdateIdeaInput,
} from "../domain/idea.js";
import type { ItemVisibility } from "../domain/enums.js";
import type { IdeaRollup, RollupMap } from "../domain/search.js";
import type { Solution } from "../domain/solution.js";

export interface IdeasProvider {
  listIdeas(query?: IdeaQuery): Promise<PageResult<Idea>>;

  /**
   * Null when the idea does not exist OR the caller may not see it. The two are
   * deliberately indistinguishable: a refusal would confirm the item exists.
   */
  getIdea(id: string): Promise<Idea | null>;

  createIdea(input: CreateIdeaInput): Promise<Idea>;
  updateIdea(id: string, patch: UpdateIdeaInput): Promise<Idea>;

  /** Solutions linked to this idea, filtered to links the caller may see. */
  listLinkedSolutions(ideaId: string): Promise<Solution[]>;

  /**
   * Engagement counts for many ideas at once, keyed by idea id.
   *
   * Deliberately a batch call. Counting per row would fan out one request per item
   * per metric, which is what makes a list page unaffordable against a rate-limited
   * backend.
   */
  getIdeaRollups(ids?: string[]): Promise<RollupMap<IdeaRollup>>;

  /** Administrator-only. Providers must reject a non-administrator, not downgrade. */
  setIdeaVisibility?(id: string, visibility: ItemVisibility): Promise<Idea>;
}
