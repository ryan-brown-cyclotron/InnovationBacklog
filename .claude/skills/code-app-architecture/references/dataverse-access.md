# Querying Dataverse from a Code App

All of this lives in `packages/pp-bridge`. Nothing here should ever appear in `logic`,
`ui-kit`, or a page.

---

## The CRUD seam

The SDK client exposes five verbs. Wrap them **once** in a generic entity service so paging,
error classification, and id normalization are solved in one place:

```ts
interface IGetAllOptions {
  select?: string[];       // → $select
  filter?: string;         // → $filter (raw OData string)
  orderBy?: string[];      // → $orderby, e.g. ["createdon desc"]
  top?: number;            // → $top
  skip?: number;           // → $skip
  maxPageSize?: number;    // → Prefer: odata.maxpagesize
  skipToken?: string;      // server-driven paging cursor
  count?: boolean;         // → $count=true (see the count caveat below)
}

interface DataverseEntityService<TRow> {
  getAll(o?: IGetAllOptions): Promise<TRow[]>;
  count(o?: IGetAllOptions): Promise<number>;
  get(id: string): Promise<TRow>;
  create(record: Partial<TRow>): Promise<TRow>;
  update(record: Partial<TRow> & { [k: string]: unknown }): Promise<TRow>;
  delete(id: string): Promise<void>;
}

function entityService<TRow extends object>(
  client: DataverseClient, dataSourceName: string, primaryKey: keyof TRow & string,
): DataverseEntityService<TRow> { /* … */ }
```

Then compose a `services` object — required members for core tables, **optional** members for
tables an app may not register:

```ts
export interface Services {
  tickets: DataverseEntityService<TicketRow>;   // required
  teams?: DataverseEntityService<TeamRow>;      // optional — absent in some apps
}
```

---

## Paging: default to complete, opt into bounded

Dataverse caps a page at 5000 rows and returns a `skipToken` for the rest. The SDK's default
page size is small, so a naive `getAll` silently truncates. The rule that scales:

- Caller passed `top` → they want **one bounded page**; preserve offset paging.
- No `top` → loop on `skipToken` and return the **whole** matching set.

```ts
const FULL_FETCH_PAGE = 5000;

async getAll(options) {
  const single = options?.top !== undefined;
  const base = { ...options, maxPageSize: options?.maxPageSize ?? (single ? options?.top : FULL_FETCH_PAGE) };
  const acc: TRow[] = [];
  let skipToken = options?.skipToken;
  for (;;) {
    const res = await client.retrieveMultipleRecordsAsync<TRow>(name, skipToken ? { ...base, skipToken } : base);
    if (!res.success) { throw classifyError(res.error ?? new Error("Dataverse operation failed")); }
    acc.push(...res.data);
    if (single || !res.skipToken) { break; }
    skipToken = res.skipToken;
  }
  return acc;
}
```

Surface it to the domain as a `PageResult<T>`:

```ts
if (query?.pageSize) {
  const rows = await services.tickets.getAll({
    filter, orderBy, top: query.pageSize,
    skip: query.page ? (query.page - 1) * query.pageSize : undefined,
  });
  return { items: await enrich(rows), total: undefined,
           nextPage: rows.length >= query.pageSize ? (query.page ?? 1) + 1 : undefined };
}
const rows = await services.tickets.getAll({ filter, orderBy });   // full set
return { items: await enrich(rows), total: rows.length, nextPage: undefined };
```

### Counting

**The SDK does not reliably populate `result.count` from `$count=true`** — it usually comes
back `undefined`, and a `top: 1` fallback then returns `data.length === 1` for every non-empty
filter, which looks plausible and is always wrong. Count by paging the matching set selecting
**only the primary id column**:

```ts
async count(options) {
  const base = { ...options, select: [primaryKey], top: undefined, maxPageSize: FULL_FETCH_PAGE };
  let total = 0, skipToken = options?.skipToken;
  for (;;) {
    const res = await client.retrieveMultipleRecordsAsync<TRow>(name, skipToken ? { ...base, skipToken } : base);
    if (!res.success) { throw classifyError(res.error ?? new Error("Dataverse count failed")); }
    total += res.data.length;
    if (!res.skipToken) { break; }
    skipToken = res.skipToken;
  }
  return total;
}
```

---

## Filters

Build `$filter` from a **domain query object**, never from caller-supplied strings. One
builder function per entity keeps the OData vocabulary in one place:

```ts
function buildTicketFilter(q?: TicketQuery): string | undefined {
  const clauses: string[] = [];
  if (q?.search) {
    const s = escapeODataString(q.search);
    clauses.push(`(contains(acme_title,'${s}') or contains(acme_name,'${s}'))`);
  }
  if (q?.assigneeId)   { clauses.push(lookupClause("_acme_assigneeid_value", q.assigneeId)); }
  if (q?.createdAfter) { clauses.push(`createdon ge ${q.createdAfter}`); }   // ISO, unquoted
  if (q?.unassigned)   { clauses.push("_acme_assigneeid_value eq null"); }
  return clauses.length ? clauses.join(" and ") : undefined;
}

const escapeODataString = (v: string) => v.replace(/'/g, "''");
```

Rules that matter:

- **Always escape single quotes** (`'` → `''`) in any string literal you interpolate.
- **GUIDs and dates are unquoted-or-quoted inconsistently across operators** — GUID equality
  works as `_x_value eq '<guid>'`; datetimes as `createdon ge 2026-01-01T00:00:00Z` without
  quotes. Strip `{}` from GUIDs before use.
- **Do not use `Microsoft.Dynamics.CRM.In` for choice/picklist values.** Its `PropertyValues`
  is `Collection(Edm.String)`, so an integer choice value fails with *"Cannot convert the
  literal '100000001' to Edm.String"*. OR-expand instead:
  `(statuscode eq 1 or statuscode eq 2)`.
- Give yourself a **sentinel for "is empty"** so a filter UI can express *unset*:
  ```ts
  const FILTER_EMPTY = "__empty__";   // exported from logic
  const lookupClause = (col: string, v: string) =>
    v === FILTER_EMPTY ? `${col} eq null` : `${col} eq '${v}'`;
  ```

### Sorting

Only **scalar** columns sort server-side. A lookup orders by GUID, which is meaningless. Map
domain sort fields to columns and omit lookups — then sort those client-side by resolved
display name:

```ts
const SORT_COLUMN: Partial<Record<SortField, string>> = {
  id: "acme_name", subject: "acme_title", status: "statuscode",
  created: "createdon", updated: "modifiedon",
  // category/assignee absent on purpose — client-sorted by name
};
const orderBy = SORT_COLUMN[q.sort.field]
  ? [`${SORT_COLUMN[q.sort.field]} ${q.sort.descending ? "desc" : "asc"}`]
  : ["createdon desc"];
```

Constrain the domain sort type to the sortable set so a caller can't request an impossible
sort.

---

## Lookups: read one way, write another

**Reading.** The tabular SDK returns the GUID as `_<field>_value` and a *denormalized*
display name as `<field>name`. It does **not** return
`_<field>_value_formatted` — that annotation only exists on the raw Web API with a
`Prefer: odata.include-annotations` header. Type both and rely on neither:

```ts
export interface TicketRow extends SystemColumns {
  acme_ticketid: string;
  _acme_assigneeid_value?: string;   // the GUID — always present
  acme_assigneeidname?: string;      // SDK denormalized name — sometimes present
}
```

**Writing.** Use `@odata.bind` with the **entity set** path, and `null` to clear:

```ts
const row: Partial<TicketRow> & Record<string, unknown> = { acme_title: input.title };
if (input.categoryId) { row["acme_categoryid@odata.bind"] = `/acme_categories(${strip(input.categoryId)})`; }
if (input.ownerTeamId) { row["ownerid@odata.bind"] = `/teams(${strip(input.ownerTeamId)})`; }
// clearing, on update:
row["acme_slaid@odata.bind"] = null;
// polymorphic lookups need the disambiguated form:
row["objectid_acme_ticket@odata.bind"] = `/acme_tickets(${ticketId})`;
```

**Strip `undefined` keys before sending** — the SDK can choke on explicit `undefined`:

```ts
for (const k of Object.keys(row)) { if (row[k] === undefined) { delete row[k]; } }
```

### Resolving display names (the join you have to do yourself)

Because the SDK won't reliably give you lookup labels, fetch the referenced tables once per
list load and join client-side. Make every enrichment fetch **best-effort and cached-on-
failure**, so a table absent in one app degrades to unresolved names instead of an error:

```ts
const unavailable = new Set<string>();
async function fetchRef<T>(key: string, fetch?: () => Promise<T[]>): Promise<T[]> {
  if (!fetch || unavailable.has(key)) { return []; }
  try { return await fetch(); }
  catch (e) {
    unavailable.add(key);
    console.warn(`[ref] '${key}' unavailable — names will not resolve:`, e);
    return [];   // deliberately NOT an error toast
  }
}

const [users, teams] = await Promise.all([
  fetchRef("systemUsers", services.systemUsers && (() => services.systemUsers!.getAll({ filter: "isdisabled eq false" }))),
  fetchRef("teams", services.teams && (() => services.teams!.getAll())),
]);
const userNames = new Map(users.map((u) => [u.systemuserid, u.fullname]));
```

For large tables this is a real cost — filter the reference fetch (`isdisabled eq false`,
`statecode eq 0`) and prefer the SDK's `<field>name` when it *is* populated:
`name: row.acme_assigneeidname ?? userNames.get(guid)`.

---

## Choices, statecode, statuscode

Keep integer↔name translation in **one registry** in the bridge, and let the domain speak in
string names only:

```ts
export interface ChoiceRegistry {
  ticketType: Record<number, string>;
  ticketStatuscode: Record<number, string>;
}
const value = choiceNameToValue(state, registry.ticketStatuscode);
const name  = choiceValueToName(row.statuscode, registry.ticketStatuscode);
```

**Set `statecode` and `statuscode` together.** A terminal status reason is rejected unless its
`Inactive` statecode is set in the same update, and reopening must reset `statecode: 0`:

```ts
row.statecode = stateToStatecode(patch.state);          // 0 active / 1 inactive
row.statuscode = choiceNameToValue(patch.state, registry.ticketStatuscode);
```

For coarse lifecycle filters, prefer raw values so the filter doesn't depend on the registry
being loaded:

```ts
if (q.lifecycle === "open")   { clauses.push("(statecode eq 0 and statuscode ne 100000007)"); }
if (q.lifecycle === "closed") { clauses.push("(statecode eq 1 or statuscode eq 100000007)"); }
```

---

## Create / update normalization

Two SDK behaviours to absorb in the service wrapper:

- **`create` may return `{ id }` instead of `{ [primaryKey] }`.** Normalize:
  ```ts
  if (!(primaryKey in raw) && "id" in raw) { raw[primaryKey] = raw.id; }
  ```
- **`update` takes `(id, changedFields)`**, so split the primary key out of the patch object:
  ```ts
  const { [primaryKey]: _id, ...changedFields } = record;
  return unwrap(await client.updateRecordAsync(name, id, changedFields));
  ```

The row returned from create/update is often thin (no lookups, no computed columns). If the
caller needs a complete domain object back, **re-hydrate** with a filtered `getAll` before
mapping.

> `retrieveRecordAsync` (single-record `get`) has proven less reliable than a filtered
> `getAll` in some environments. If a `get`-by-id path misbehaves, fall back to
> `getAll({ filter: "<pk> eq <guid>" })` and take `[0]`.

---

## Files and notes via `annotation`

One table serves both notes and attachments. `documentbody` is base64.

```ts
const row: Partial<AnnotationRow> & Record<string, unknown> = {
  subject: "attachment",
  filename: input.filename,
  mimetype: input.mimetype,
  documentbody: input.base64,
  isdocument: true,
};
row["objectid_acme_ticket@odata.bind"] = `/acme_tickets(${ticketId})`;
await services.annotations.create(row);
```

`objectid` is polymorphic → always use the disambiguated `objectid_<logicalname>@odata.bind`.
Reading a body back is a second fetch (`documentbody` is heavy — never `$select` it in a
list); list with `select` excluding it, then fetch one record for the body.

---

## Errors: classify at the adapter boundary

The SDK reports failures three different ways — a thrown `Error` with an HTTP-ish message, an
OData `{ error: { code, message } }` envelope, or a bare `success: false`. Normalize all of
them into one domain error type with a category, keep the raw error on `cause`, and never put
raw OData text in front of a user:

```ts
export type ErrorCategory =
  | "init" | "permission" | "notFound" | "conflict" | "throttle" | "network" | "unknown";

export function classifyError(raw: unknown, opts: { category?: ErrorCategory } = {}): AppError {
  if (raw instanceof AppError) { return raw; }     // idempotent
  return new AppError(technicalMessage(raw), { category: opts.category ?? categorize(raw), cause: raw });
}
```

`categorize` probes status first, then message keywords:

| Status | Category | Keyword fallbacks |
|---|---|---|
| 401 / 403 | `permission` | forbidden, unauthor, privilege, access denied |
| 404 | `notFound` | not found, does not exist, `0x80040217` |
| 409 / 412 | `conflict` | precondition, etag, was modified |
| 429 | `throttle` | throttl, too many requests, rate limit |
| ≥ 500 | `network` | timeout, failed to fetch, offline, econnreset |

### Recovered failures must still be visible

When you swallow an error to keep the UI rendering, say so — a silent empty list is
indistinguishable from "no data":

```ts
function reportSwallowed(context: string, error: unknown): void {
  console.warn(`[app] ${context} failed:`, error);
  emitError(classifyError(error));    // → error bus → toast at the app root
}
```

Exception: **display-name enrichment failures** should log but *not* emit — they're expected
in apps that don't register the reference table (see `fetchRef` above).

---

## Gotcha checklist

- `getClient` is a singleton — the first registry wins (SKILL.md §6).
- `result.count` from `$count=true` is unreliable → count by paging ids.
- Default page size truncates → loop `skipToken` unless `top` was requested.
- `Microsoft.Dynamics.CRM.In` can't take integer choice values → OR-expand.
- Lookup labels aren't returned → join client-side; `_x_value_formatted` does not arrive.
- Lookups sort by GUID server-side → sort by name client-side.
- Connector calls resolve `{success:false}` instead of throwing → check every one.
- Explicit `undefined` values in a write payload → delete the keys first.
- `create` may return `{ id }` not `{ <pk> }` → normalize.
- Terminal `statuscode` without `statecode` → rejected; set both.
- Escape `'` in every interpolated string literal.
