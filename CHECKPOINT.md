# CHECKPOINT — 2026-08-12

## Done: .NET 10 + Aspire 13.4.6

The previous checkpoint called for .NET 9 → 10 and "Aspire 8.2.2 → 9.0+". Two things
it had wrong, both now settled:

- **Aspire's current release is 13.4.6**, not 9.x — that line was re-versioned.
- **`Momentum.AppHost` could not build at all.** Not a warning: `aspire.hosting.apphost/8.2.2`
  raises `ASPIRE005` when `$(AspireHostingSDKVersion)` is unset, and it was unset
  because the workload is gone from .NET 9+ SDKs and this repo never adopted the NuGet
  SDK that replaced it. The `Projects.Momentum_*` metadata classes were never generated
  either, so `Program.cs` had nothing to compile against.

Aspire 13 changed the AppHost project shape again — the 9.x `<Sdk Name=… />` child
element became a project-level SDK, and it supplies `Aspire.Hosting.AppHost` implicitly:

```xml
<Project Sdk="Aspire.AppHost.Sdk/13.4.6">
```

That version is inline and **cannot be centralised** — MSBuild resolves it before
`Directory.Packages.props` is read. Bump it by hand alongside the Aspire packages.

Also: the `mcp` resource was wired with `AddProject`, which runs the isolated worker
executable directly. The worker does not serve `/runtime/webhooks/mcp` — the Functions
*host* does — so that resource had never served anything. It now launches Core Tools
via `AddExecutable`, mirroring the `frontend` resource. `AddAzureFunctionsProject` is
the tidier model but provisions Azurite as a container; this dev loop runs Azurite via
npx, so that swap waits.

**Verified:** clean restore, `dotnet build Momentum.slnx` with 0 warnings, 124 tests
passing, AppHost dashboard up with `service` and `mcp` both live.

## Done: MCP server foundation

`src/Momentum.Mcp` was five files and no `[Function]` at all. It is now a working
server — Functions MCP extension 1.6.0, streamable HTTP, one tool — verified by
driving the real protocol (`initialize` → `tools/list` → `tools/call`) against
`http://localhost:7071/runtime/webhooks/mcp`.

What is built is the floor, not the surface: options binding, the on-behalf-of token
provider, per-caller/per-resource token caching, one HTTP client per backend, and
`whoami` as a smoke test. No domain tools yet — that is the next section.

Three findings worth not rediscovering:

1. **MCP tool calls never touch the worker's ASP.NET Core pipeline**, so there is no
   `HttpContext` to read the caller from. The inbound token is reachable only via
   `ToolInvocationContext.TryGetHttpTransport(…).Headers`. `CallerContext` reads it
   there and is threaded through explicitly rather than held in ambient state.
2. **OBO is an explicit MSAL `AcquireTokenOnBehalfOf`** against `Microsoft.Identity.Client`,
   not `Microsoft.Identity.Web` — the latter's conveniences hang off an ASP.NET Core
   auth pipeline a Functions worker has not got.
3. **`Microsoft.ApplicationInsights.WorkerService` is pinned to 2.23.0 deliberately.**
   3.x removed `ITelemetryInitializer`, which the Functions adapter still binds
   against, and the worker dies at startup with a `TypeLoadException`. Move both
   together or not at all.

Azure DevOps refuses a request it cannot place with a **302 to an HTML sign-in page**,
not a 401 — confirmed against the live service, with `Accept: application/json` set.
Followed, that redirect returns `200 text/html` and the auth failure surfaces as a JSON
parse error pointing at `'<'`. Auto-redirect is off on the ADO client, and both
backends' error *bodies* are surfaced, because that is where the diagnostic lives:

```
azureDevOps  reachable: false  401 — VS403318: <user> has not accepted the invitation
                               to the Cyclotron Inc. organization.
dataverse    reachable: true   systemuserid c2c73a3d-…
```

That asymmetric result is the design working, not a half-failure — see the contract
below.

`scripts/provisioning/Provision-McpAppRegistration.ps1` provisions the Entra
registration. It resolves the downstream scope ids rather than hardcoding them, so a
missing Dataverse service principal fails immediately instead of becoming an opaque
consent error later. Admin consent and enabling App Service Authentication are printed
as follow-ups, not attempted. **Not yet run against a real tenant.**

---

## Next: the tool surface

Tools speak the **domain's vocabulary**, not CRUD. The agent should ask for an idea or
a solution, never for a work item type filter or an OData `$filter`. Each tool fans out
internally to whichever backend holds the answer.

The primary discovery surface is faceted search:

```
search(facet: "idea" | "solution", query: string)
```

One call, one contract, regardless of how many round trips it costs underneath. The
facet selects the work item type; the query is free text. Everything else follows from
that shape:

| Tool | Answers from | Notes |
|---|---|---|
| `search(facet, query)` | ADO | WIQL `CONTAINS WORDS` over title/description, filtered by type |
| `list(facet, status?, tag?)` | ADO | Tags ride inside WIQL — `[System.Tags] CONTAINS 'x'`. No separate endpoint |
| `get(facet, id)` | ADO **+** Dataverse | Work item, plus its engagement rollup |
| `describe(facet)` | ADO | States, fields, and tags that exist, so the model builds valid filters instead of guessing |

**Bake the two-hop into every ADO tool.** Azure DevOps querying is WIQL → *ids only* →
batch-hydrate by id, regardless of the SELECT list. That asymmetry against Dataverse's
single OData request is plumbing, and the agent should never see it.

**Engagement comes from Dataverse, and `cycai_momentum` is the read.** Votes, adoptions
and participation are keyed by `systemuserid`, and the precomputed rollup exists because
FetchXML aggregates cannot order by an aggregate value — demand rank is not a live
query. `get` is where the two stores meet; `search` and `list` should not pay for the
join.

**Every tool reports per-backend reachability rather than failing whole.** The two
grants are independent: a caller with a Dataverse role but no ADO project membership
gets one answer and one 403. `whoami` already sets this precedent and is the tool to
reach for when data looks missing — it distinguishes "you have no access" from "there
is nothing there", which no other tool can.

**Cache metadata, never results.** `describe` output is org- and schema-level and is
safely cached server-wide. Everything `search`, `list`, and `get` return reflects
row-level access and must never be cached across users.

Write tools stay out of scope and, when they arrive, arrive separately and gated.

---

## Standing decision: what a person is

Unchanged and still unbuilt — `view === "people"` renders a placeholder. Recorded here
because the answer looks arbitrary until you see which id each store actually holds.

Person identity is **the ADO identity (UPN), not the Dataverse GUID.** No cross-store
join.

| Store | Key | What is keyed by it |
|-------|-----|---------------------|
| Azure DevOps | `uniqueName` (UPN) | Idea author, solution owner, comment author, `CurrentUser.id`, role |
| Dataverse | `systemuserid` (GUID) | Votes, adoptions, participation, activity `actorId` |

`CurrentUser.id` is the ADO identity, and that is load-bearing —
[`dataverse/identity.ts:90-103`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts#L90-L103)
says so at length. Every "is this mine?" comparison the UI makes is against a value
that came off a work item, so putting the GUID there would make those comparisons never
match and would silently hide every ownership affordance. The GUID stays reachable
separately through `currentSystemUserId()` for stamping Dataverse writes.

**There is no user directory on either host.** No `IUserRepository`, no `/api/people`,
no `AppUser` table — and the Dashboard already explains the consequence to users:
["No user directory on this backend, so there is no denominator"](src/Momentum.Frontend/packages/ui/src/Pages/Dashboard/Dashboard.tsx#L125).
**People are always derived, never looked up.** A directory is a distinct-values pass
over rows the app already fetches, not a table read — ideas, solutions and comments
carry the person key inline.

`resolveUsers` goes **one way: GUID → name and email**
([`identity.ts:136-154`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts#L136-L154)).
A UPN passed in is discarded before the query runs. So ADO-keyed data (ideas, solutions,
comments) is directly usable; Dataverse-keyed data (votes, adoptions, activity) can be
*projected onto* an ADO identity but not *filtered by* one.

Known gaps when People is picked up:

1. **Display names are being thrown away.** `identity()` returns `uniqueName` and only
   falls back to `displayName`, so the friendly name arriving on the same ADO identity
   object is discarded. That is the cheapest source of display names there is — no
   Dataverse round trip, no Entra. Capturing both is a small change at one helper.
   Without it an ADO-derived person list is UPNs and nothing else, because
   `resolveUsers` cannot name it.
2. **No actor-scoped activity query.** `ActivityQuery` has no `actorId`, in the domain
   type, any provider, or the REST surface; `IAuditRepository` has `GetBySubject` and
   `GetRecent` and no `GetByActor`.
3. **No single-person rollup.** `rankContributors` proves the tally is computable, but
   it is a whole-table scan truncated to a leaderboard, not a lookup by id.
4. **Email ids need URL encoding through the route seam.** `callTool.ts` does
   `path.split("/")` without decoding, so a percent-encoded UPN arrives still encoded.

Out of scope: rich profile fields (no avatar, team, title, department) and any
cross-store identity join.

---

## Known config drift

`src/Momentum.Contracts/tgconfig.json` and the root `Dockerfile` still name `net9.0` /
`sdk:9.0`. Left deliberately, but the TypeGen path now points at an assembly that no
longer exists, and it fails quietly rather than loudly.
