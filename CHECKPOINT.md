# CHECKPOINT — 2026-08-13

## Done: the MCP tool surface

`src/Momentum.Mcp` had one tool (`whoami`) and no domain surface. It now has the four the
last checkpoint specified, driven end to end over the real protocol (`initialize` →
`tools/list` → `tools/call`) against `http://localhost:7071/runtime/webhooks/mcp`:

| Tool | Answers from | Shape |
|---|---|---|
| `search(facet, query)` | ADO | WIQL `CONTAINS WORDS` over title **and** description |
| `list(facet, status?, tag?)` | ADO | Tags ride inside WIQL, no tagging endpoint |
| `get(facet, id)` | ADO **+** Dataverse | Work item, relations, and engagement |
| `describe(facet)` | ADO | States, tags, fields — cached server-wide |

New code is `src/Momentum.Mcp/Backlog/` (facet vocabulary, WIQL builder, the two-hop
repository, engagement reader, mapper, metadata catalog), `Backends/BackendStatus.cs` and
`Backends/BackendJson.cs` (extracted from `DiagnosticsTool`, which four tools now share),
and `Tools/BacklogTools.cs`. 0 warnings, 229 tests passing.

**Verified:** `tools/list` returns five tools with correct input schemas; malformed
arguments come back as a sentence naming the valid values rather than an exception; a
backend failure is reported per backend instead of failing the call.

**Not verified: any query against live data.** See the blocker below. No WIQL has ever
executed — which specifically means `CONTAINS WORDS` is unproven. If full-text search is not
enabled on that collection, Azure DevOps rejects the operator with a 400 and `search`
surfaces the error body. First thing to check when auth works.

### Three findings worth not rediscovering

1. **`McpToolProperty`'s second argument is the DESCRIPTION, not the type.** The JSON type
   comes from the parameter's CLR type and is emitted as `dataType`. The attribute also has
   a `Description` property, and setting both writes `description` twice into
   `functions.metadata`. The mistake compiles and deploys; it shows up only as a tool whose
   argument is described as "string". Also: the generator emits no `dataType` at all for an
   `int?`, so every tool argument here is a `string` and ids are parsed in the body.
2. **`cycai_momentum` is NOT the read, and the last checkpoint was wrong to say so.**
   Nothing has ever written to that table — no plugin, flow or worker — and the code app was
   moved off it for exactly that reason after every count came back zero
   ([`rollups.ts:9-29`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/rollups.ts#L9-L29)).
   `EngagementReader` computes counts live from `cycai_vote`, `cycai_adoption` and
   `cycai_participation`, and reads `cycai_momentum` for **demand rank only** — a
   whole-catalogue ordering genuinely is not a live query per item. Absent row means
   `demandRank: null` with the reason attached, never a zero that reads as fact.
3. **A facet is "idea" outside and `request:` inside.** The Dataverse engagement key for an
   idea is `request:123`, because the domain type is `HubItemType.Request`. Getting this
   wrong returns zero votes for every idea — plausible, and always wrong.

### One decision to revisit

The catalogue clause does **not** resolve the caller's role, so an Approver using an agent
does not see other people's solutions awaiting approval; the code app shows them. Rationale
in [`Wiql.cs`](src/Momentum.Mcp/Backlog/Wiql.cs): role resolution is three extra Azure
DevOps round trips per call, and the error direction matters — a reviewer seeing one row
fewer is cheaper than a disclosure. `@Me` keeps the author exception either way.

---

## Blocker: neither backend authenticates

Both refuse as of today, and it is environmental — proved with plain `curl` and an `az`
token, bypassing the server:

```
GET https://dev.azure.com/CyclotronInc/_apis/projects   302  (redirect to sign-in)
GET https://org9ceb01a6.crm.dynamics.com/.../WhoAmI     403  0x80072560
                                                        "The user is not a member of the organization."
```

A regression against the last checkpoint, which recorded ADO 401/`VS403318` and Dataverse
**reachable** (`systemuserid c2c73a3d-…`). Signed-in CLI identity is
`Ryan.Brown@cyclotron.com`, tenant `b9894c34`. ADO no longer reaches 401, so this is not
just the unaccepted org invitation. Suspect the CLI is authenticating against the wrong
tenant, or access was withdrawn.

Everything below the token layer is exercised; nothing above it is.

---

## Next: opening a solution costs 14 calls

Measured from `apps.powerapps.com.har`, opening solution **4462**: **14 data calls**
(4 telemetry beacons excluded), **3763ms wall**, **7152ms of summed request time**.

The shape matters more than the count. It is **four sequential waves**, not fourteen serial
calls — so the cost is waterfall *depth* plus one very slow call:

```
wave 0   t=0      1 call    468ms   getSolution — workitems/4462?$expand=relations
wave 1   t=1000   1 call   1557ms   workitems/4462/revisions          <- longest single call
wave 2   t=2000   9 calls   598ms   the six-way Promise.allSettled, fanned out
wave 3   t=3000   3 calls   763ms   the two-hop's second leg
```

Wave 2 is [`App.tsx:211-220`](src/Momentum.Frontend/packages/ui/src/App.tsx#L211-L220) —
`/requests`, `/comments`, `/activity`, `/use`, `/issues`, `/milestones` in parallel. Those
six become nine calls, and produce ids that wave 3 then has to hydrate.

### What is actually wasted

**`workitems/4462?$expand=relations` is fetched three times**, identically, by three call
sites that never learn of each other:

| # | Call site | Reached via |
|---|---|---|
| 1 | [`items.ts:373`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/items.ts#L373) `getSolution` | `/api/solutions/{id}` |
| 2 | [`items.ts:407`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/items.ts#L407) `listLinkedIdeas` | `/requests` |
| 3 | [`comments.ts:75`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/comments.ts#L75) attachment relations | `/comments` |

**`systemusers?$select=…&$filter=(systemuserid eq 'c2c73a3d-…')` is fetched twice**, byte
for byte — once resolving activity actors, once resolving adoption starters. Same GUID, two
requests, no shared resolution.

**Three `workitemsbatch` POSTs each carry exactly one id** — `[4472]` (issue), `[4454]`
(linked idea), `[4473]` (milestone) — with three different field projections. That is the
whole of wave 3: 1923ms of summed time to fetch three work items.

**Two WIQL queries differ only by work item type.** Both are `[System.Parent] = 4462`, one
for `Issue` and one for `Milestone`.

**Every Dataverse read is its own `$batch` POST containing a single GET.** Four batch
requests, four single-statement batches.

### The plan, in order of value

1. **A per-page-open request cache at the provider seam.** Keyed on method + URI + body,
   living for one open rather than for the session — engagement must not be cached across
   readers or across time. Fixes the three work-item reads and the two `systemusers` reads
   with one mechanism: **14 → 11**, no call-site changes.
2. **Get `revisions` off the critical path.** It costs 1557ms and 16KB to produce one date,
   `publishedAt`, via `stateReachedAt`. Two independent moves: switch to
   `_apis/wit/workitems/{id}/updates`, which returns field *deltas* rather than whole
   snapshots and is a fraction of the payload; and load it lazily instead of before the
   panel renders. Removes wave 1 entirely.
3. **Coalesce the two-hop's second leg.** A microtask-batching loader that collects ids
   requested within a tick and issues one `workitemsbatch` with the union of the
   projections. **3 calls → 1**, and wave 3 stops being three round trips wide. This is the
   structural fix; note `workitemsbatch` takes one `fields` array for the whole request, so
   the union is a slightly heavier payload per item in exchange for two fewer round trips.
4. **Merge the two child WIQL queries** into one `[System.Parent] = 4462 AND
   [System.WorkItemType] IN ('Issue','Milestone')` and split the rows by type client-side.
   Ordering is already re-done client-side for milestones — `listMilestones` re-sorts with
   `compareMilestones` because WIQL leaves null ordering unspecified — so nothing is lost.
   **2 → 1**.
5. **Investigate real Dataverse batching.** Multi-GET `$batch` is exactly what the four
   single-GET batches want, but the generated services build one batch per operation and
   `IGetAllOptions` has no seam for it. Establish whether this is reachable through the SDK
   before designing around it.

Target: **14 calls → 7**, and the waterfall from four waves to two. Worth it beyond the
3.7s: the connector's budget is **300 calls per 60 seconds**, so 14 calls per open caps a
reader at roughly twenty solutions a minute before throttling — and that budget is shared
with every list, search and rollup on the page behind the panel.

### The MCP server has an advantage here, and should keep it

`BacklogTools.Get` is already 2 waves and at most 6 calls — one work item, one hydration of
its links, four Dataverse reads fired in parallel. It should stay that way, and it has a
lever the code app does not: it speaks the Dataverse Web API directly rather than through
the generated services, so `$batch` with several GETs **is** available to it. Folding
`EngagementReader`'s four reads into one batch is the obvious next optimization on that side
and has no SDK constraint in the way.

---

## Standing decision: what a person is

Unchanged and still unbuilt — `view === "people"` renders a placeholder. Recorded because
the answer looks arbitrary until you see which id each store holds.

Person identity is **the ADO identity (UPN), not the Dataverse GUID.** No cross-store join.

| Store | Key | What is keyed by it |
|-------|-----|---------------------|
| Azure DevOps | `uniqueName` (UPN) | Idea author, solution owner, comment author, `CurrentUser.id`, role |
| Dataverse | `systemuserid` (GUID) | Votes, adoptions, participation, activity `actorId` |

`CurrentUser.id` is the ADO identity, and that is load-bearing —
[`dataverse/identity.ts:90-103`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts#L90-L103)
says so at length. Every "is this mine?" comparison the UI makes is against a value that
came off a work item, so putting the GUID there would make those comparisons never match
and silently hide every ownership affordance. The GUID stays reachable separately through
`currentSystemUserId()` for stamping Dataverse writes.

**There is no user directory on either host.** People are always derived, never looked up —
a distinct-values pass over rows the app already fetches. `resolveUsers` goes **one way:
GUID → name and email**; a UPN passed in is discarded before the query runs. So ADO-keyed
data is directly usable, and Dataverse-keyed data can be *projected onto* an ADO identity
but not *filtered by* one.

Known gaps when People is picked up:

1. **Display names are being thrown away** in the code app: `identity()` returns
   `uniqueName` and only falls back to `displayName`. The MCP server no longer does this —
   `WorkItems.Identity` captures both, because they arrive on the same object and it is the
   cheapest source of a friendly name there is. The code app still needs the same change,
   or an ADO-derived person list is UPNs and nothing else.
2. **No actor-scoped activity query.** `ActivityQuery` has no `actorId` in the domain type,
   any provider, or the REST surface; `IAuditRepository` has `GetBySubject` and `GetRecent`
   and no `GetByActor`.
3. **No single-person rollup.** `rankContributors` proves the tally is computable, but it is
   a whole-table scan truncated to a leaderboard, not a lookup by id.
4. **Email ids need URL encoding through the route seam.** `callTool.ts` does
   `path.split("/")` without decoding, so a percent-encoded UPN arrives still encoded.

Out of scope: rich profile fields and any cross-store identity join.

---

## Known config drift

`src/Momentum.Contracts/tgconfig.json` and the root `Dockerfile` still name `net9.0` /
`sdk:9.0`. Left deliberately, but the TypeGen path now points at an assembly that no longer
exists, and it fails quietly rather than loudly.
