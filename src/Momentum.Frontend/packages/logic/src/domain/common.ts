/**
 * Shared domain primitives.
 *
 * WHY THESE TYPES ARE REFINED RATHER THAN RE-EXPORTED
 *
 * `@momentum/contracts` is generated from `src/Momentum.Contracts/Models.cs` by
 * TypeGen, and TypeGen flattens C# nullability: `string? CanonicalSolutionId`
 * becomes `canonicalSolutionId: string`, not `string | null`. Over twenty fields
 * are affected, including `SolutionUseResponse.completedAt`, which is null for
 * every adoption that is still active — the exact value the domain tests with
 * `IsActive => CompletedAt is null`.
 *
 * Re-exporting the generated types directly would inherit that lie and hand it to
 * every page. So the domain declares refined types that restore nullability and
 * narrow the wire's bare `string` enums to unions.
 *
 * The drift guardrail is kept by asserting, at compile time, that every field the
 * domain names still exists on the generated DTO — see `FieldsExistOn` below. A
 * C# rename still breaks the build; only the nullability is corrected.
 */

/** A page of results. `total` is only populated when the whole set was fetched. */
export interface PageResult<T> {
  items: T[];
  total?: number;
  nextPage?: number;
}

/** Sentinel for "match rows where this reference is unset". */
export const FILTER_EMPTY = "__empty__";

/** Sort direction shared by every query type. */
export interface SortSpec<TField extends string> {
  field: TField;
  descending?: boolean;
}

/**
 * A capability that exists but could not be served. Surfaces render a degraded
 * state instead of erroring the page — see the capability-gating rules in
 * `.claude/skills/code-app-architecture` §3.
 */
export type Unavailable = "permission" | "notConfigured" | "throttled";

export interface MaybeUnavailable {
  unavailable?: Unavailable;
}

// ---------------------------------------------------------------------------
// Compile-time drift guards
// ---------------------------------------------------------------------------

/** Fails to compile unless `T` is exactly `true`. */
export type Assert<T extends true> = T;

/**
 * `true` when every key of `TDomain` also exists on `TWire`.
 *
 * Used to prove a refined domain type has not drifted from its generated
 * counterpart. Extra keys on the wire type are fine (the domain need not surface
 * everything); a key the domain names that the wire no longer has is a build error.
 */
export type FieldsExistOn<TDomain, TWire> =
  Exclude<keyof TDomain, keyof TWire> extends never ? true : false;

/**
 * `FieldsExistOn`, minus a named set of fields the adapter supplies itself.
 *
 * Some domain fields have no wire counterpart by design — a display name an adapter
 * resolves locally, for instance. Listing them here keeps the guard honest: they are
 * enumerated rather than assumed, so any OTHER field that stops existing on the wire
 * still fails the build. Deleting the guard, or widening it to allow anything, would
 * throw away the only thing that catches C# renames.
 */
export type FieldsExistOnExcept<TDomain, TWire, TLocal extends keyof TDomain> =
  Exclude<Exclude<keyof TDomain, TLocal>, keyof TWire> extends never ? true : false;
