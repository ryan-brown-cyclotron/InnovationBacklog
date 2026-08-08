import type { RequestResponse } from "@momentum/contracts";
import type { Assert, FieldsExistOn, SortSpec } from "./common.js";
import type { IdeaKind, IdeaStatus, ItemVisibility } from "./enums.js";

/**
 * Something the organization needs.
 *
 * Field names match `RequestResponse` exactly so the drift guard below is
 * meaningful and the wire-to-domain mapper stays close to an identity. Only the
 * *types* are corrected: nullability that TypeGen dropped, and enums the wire
 * carries as bare `string`.
 *
 * "Idea" is the user-facing word; the backend still calls it a Request. See
 * docs/reference/glossary.md.
 */
export interface Idea {
  id: string;
  type: IdeaKind;
  status: IdeaStatus;
  title: string;
  description: string;
  submittedBy: string;
  /** Null until an approver picks the solution that answers this idea. */
  canonicalSolutionId: string | null;
  createdAt: string;
  updatedAt: string;
  visibility: ItemVisibility;
  tags: string[];
}

/** Breaks the build if a field is renamed or removed in Momentum.Contracts. */
export type IdeaMatchesWire = Assert<FieldsExistOn<Idea, RequestResponse>>;

export type IdeaSortField = "title" | "status" | "created" | "updated" | "votes";

export interface IdeaQuery {
  search?: string;
  statuses?: IdeaStatus[];
  tags?: string[];
  /** Restrict to a single submitter. Accepts FILTER_EMPTY for "unattributed". */
  submittedBy?: string;
  /** Only ideas the calling user submitted. */
  mineOnly?: boolean;
  page?: number;
  pageSize?: number;
  sort?: SortSpec<IdeaSortField>;
}

export interface CreateIdeaInput {
  title: string;
  description: string;
  type: IdeaKind;
  tags?: string[];
}

export interface UpdateIdeaInput {
  title?: string;
  description?: string;
}
