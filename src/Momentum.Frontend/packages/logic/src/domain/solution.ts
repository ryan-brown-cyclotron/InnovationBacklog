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
 * Correcting a catalog entry after it was shared.
 *
 * Title is deliberately absent. A published entry's title is how people refer to it
 * in comments and links, so renaming it is a different act from correcting a
 * description that stopped being true — and only one of those belongs behind an
 * inline "Edit" affordance. Adding `title?` later is source-compatible.
 */
export interface UpdateSolutionInput {
  description?: string;
  /** Replaces the whole set. `[]` clears them; `undefined` leaves them alone. */
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
  /**
   * Modelled, but not offered at intake.
   *
   * A kind reaches this registry before it reaches the form: the ADO picklist value
   * and the C# enum member are permanent once created, so they are claimed early,
   * while the form is a decision that can wait. Records of a hidden kind still
   * READ correctly everywhere — `solutionKindSpec` resolves it, the detail modal
   * labels it — because hiding it from the picker is a statement about intake, not
   * about the catalogue.
   */
  hidden?: boolean;
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
  {
    id: "Skill",
    label: "Skill",
    description:
      "A packaged agent skill: instructions, and whatever they need to run.",
    /*
      Nothing. Not an oversight — a skill's repository folder is CREATED by skill
      intake at plugins/{segment}/skills/{solutionId}__{name}/, so asking an author
      to name a repository would be asking them to guess at a path the pipeline is
      about to assign. `requires` says what the AUTHOR must supply, and for a skill
      that is the package, which this form does not yet take.
    */
    requires: [],
    hidden: true,
  },
];

/**
 * The kinds intake may offer.
 *
 * Pickers render THIS, never `SOLUTION_KINDS` — see `SolutionKindSpec.hidden`.
 */
export const INTAKE_SOLUTION_KINDS: readonly SolutionKindSpec[] = SOLUTION_KINDS.filter(
  (spec) => !spec.hidden,
);

/**
 * Resolves against the full registry, hidden kinds included: an existing record of
 * a hidden kind still has to render with its own label rather than silently
 * claiming to be the first kind in the list.
 */
export function solutionKindSpec(kind: SolutionKind): SolutionKindSpec {
  return SOLUTION_KINDS.find((spec) => spec.id === kind) ?? INTAKE_SOLUTION_KINDS[0]!;
}

export function requires(kind: SolutionKind, requirement: SolutionRequirement): boolean {
  return solutionKindSpec(kind).requires.includes(requirement);
}
