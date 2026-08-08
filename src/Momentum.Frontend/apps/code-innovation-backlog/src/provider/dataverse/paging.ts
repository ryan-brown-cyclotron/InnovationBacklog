import type { IGetAllOptions } from "../../generated/models/CommonModels.js";
import { unwrap } from "../errors.js";
import type { OperationResult } from "../errors.js";

/**
 * Paging over the generated services.
 *
 * The SDK's `getAll` issues ONE request. Dataverse caps a page at 5000 rows and
 * returns a skipToken for the rest, so a naive call silently truncates — and a
 * truncated list is indistinguishable from a short one. The rule:
 *
 *   caller passed `top`  -> they want one bounded page; honour it exactly
 *   no `top`             -> loop the skipToken and return the whole matching set
 */

const FULL_FETCH_PAGE = 5000;

type GetAll<TRow> = (options?: IGetAllOptions) => Promise<OperationResult<TRow[]>>;

export async function fetchAll<TRow>(
  getAll: GetAll<TRow>,
  context: string,
  options?: IGetAllOptions,
): Promise<TRow[]> {
  const bounded = options?.top !== undefined;
  const base: IGetAllOptions = {
    ...options,
    maxPageSize: options?.maxPageSize ?? (bounded ? options?.top : FULL_FETCH_PAGE),
  };

  const rows: TRow[] = [];
  let skipToken = options?.skipToken;

  for (;;) {
    const result = await getAll(skipToken ? { ...base, skipToken } : base);
    rows.push(...unwrap(result, context));
    if (bounded || !result.skipToken) break;
    skipToken = result.skipToken;
  }

  return rows;
}

/**
 * Count by paging primary ids.
 *
 * `$count` is not reliably surfaced by the SDK, and the obvious fallback —
 * `top: 1` and reading `data.length` — returns 1 for every non-empty filter, which
 * looks plausible and is always wrong. Selecting only the id keeps the payload
 * small enough that paging for a count is affordable.
 */
export async function countAll<TRow>(
  getAll: GetAll<TRow>,
  primaryKey: string,
  context: string,
  options?: IGetAllOptions,
): Promise<number> {
  const base: IGetAllOptions = {
    ...options,
    select: [primaryKey],
    top: undefined,
    maxPageSize: FULL_FETCH_PAGE,
  };

  let total = 0;
  let skipToken: string | undefined;

  for (;;) {
    const result = await getAll(skipToken ? { ...base, skipToken } : base);
    total += unwrap(result, context).length;
    if (!result.skipToken) break;
    skipToken = result.skipToken;
  }

  return total;
}

/** Escape a string literal for an OData filter. Forgetting this breaks on any apostrophe. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Strip the braces Dataverse sometimes wraps around a GUID. */
export function guid(value: string): string {
  return value.replace(/[{}]/g, "");
}

/** `a and b and c`, skipping empties, or undefined when there is nothing to filter on. */
export function allOf(...clauses: (string | undefined | false)[]): string | undefined {
  const kept = clauses.filter((clause): clause is string => Boolean(clause));
  return kept.length > 0 ? kept.join(" and ") : undefined;
}

/**
 * `(x eq 1 or x eq 2)`.
 *
 * Deliberately not `Microsoft.Dynamics.CRM.In`: its PropertyValues is
 * Collection(Edm.String), so an integer choice value fails with "Cannot convert
 * the literal '100000001' to Edm.String".
 */
export function anyOf(column: string, values: readonly (string | number)[]): string | undefined {
  if (values.length === 0) return undefined;
  const clauses = values.map((value) =>
    typeof value === "number" ? `${column} eq ${value}` : `${column} eq '${odataString(value)}'`,
  );
  return `(${clauses.join(" or ")})`;
}
