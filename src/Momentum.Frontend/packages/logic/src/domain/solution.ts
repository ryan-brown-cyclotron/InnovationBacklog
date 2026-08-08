import type { SolutionResponse } from "@momentum/contracts";
import type { Assert, FieldsExistOn, SortSpec } from "./common.js";
import type { ItemVisibility, SolutionKind, SolutionStatus } from "./enums.js";

/**
 * A reusable solution in the catalog.
 *
 * Field names mirror `SolutionResponse`; only nullability and enum narrowing are
 * corrected. `useCount` and `adoptedByProjects` are denormalized counters the API
 * carries on the record — prefer the adoption rollup for anything ranked, and treat
 * these as display conveniences.
 */
export interface Solution {
  id: string;
  title: string;
  description: string;
  type: SolutionKind;
  status: SolutionStatus;
  repositoryOwner: string;
  repositoryName: string;
  repositoryUrl: string;
  /** Optional link to a working demo or worked example. */
  demoUrl: string | null;
  ownerId: string | null;
  useCount: number;
  adoptedByProjects: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  visibility: ItemVisibility;
  tags: string[];
}

/** Breaks the build if a field is renamed or removed in Momentum.Contracts. */
export type SolutionMatchesWire = Assert<FieldsExistOn<Solution, SolutionResponse>>;

export type SolutionSortField =
  | "title"
  | "status"
  | "created"
  | "updated"
  | "adoptions"
  | "votes";

export interface SolutionQuery {
  search?: string;
  statuses?: SolutionStatus[];
  kinds?: SolutionKind[];
  tags?: string[];
  ownerId?: string;
  mineOnly?: boolean;
  page?: number;
  pageSize?: number;
  sort?: SortSpec<SolutionSortField>;
}

export interface CreateSolutionInput {
  title: string;
  description: string;
  solutionType: SolutionKind;
  /** Required only for kinds whose spec lists "repository" — see SOLUTION_KINDS. */
  repositoryOwner?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  demoUrl?: string;
  tags?: string[];
}

/**
 * What a kind of solution actually consists of.
 *
 * The intake form is generated from this rather than hard-coding a field set, so a
 * strategy is not asked for a repository it will never have, and adding a kind is a
 * new entry here rather than a new branch in the form. Both the form and the
 * adapter read the same spec, so what the UI asks for and what the write path
 * requires cannot drift apart.
 */
export type SolutionRequirement = "repository" | "demo";

export interface SolutionKindSpec {
  id: SolutionKind;
  label: string;
  /** Shown under the option in the picker. */
  description: string;
  requires: readonly SolutionRequirement[];
}

export const SOLUTION_KINDS: readonly SolutionKindSpec[] = [
  {
    id: "Strategy",
    label: "Strategy",
    description:
      "An approach, pattern or way of working. There is no repository to point at — link the worked example instead.",
    requires: ["demo"],
  },
  {
    id: "CustomSolution",
    label: "Custom solution",
    description:
      "Something built and reusable: a library, service, template or application.",
    requires: ["repository"],
  },
];

export function solutionKindSpec(kind: SolutionKind): SolutionKindSpec {
  return SOLUTION_KINDS.find((spec) => spec.id === kind) ?? SOLUTION_KINDS[0]!;
}

export function requires(kind: SolutionKind, requirement: SolutionRequirement): boolean {
  return solutionKindSpec(kind).requires.includes(requirement);
}
