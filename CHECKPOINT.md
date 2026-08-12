# CHECKPOINT — 2026-08-11

## NEXT: Upgrade to .NET 10 + Aspire 9.0 (infrastructure)

After trimming to the lean baseline (commit 29624c9), upgrade all projects from .NET 9 → .NET 10 and Aspire 8.2.2 → 9.0+. The Aspire workload deprecation warning in AppHost (NETSDK1228) blocks clean builds; moving to NuGet packages + .NET 10 removes it. Coordinate: AppHost, ServiceDefaults, all Library/* projects, Mcp, Contracts.

---

Header navigation is reshaped and shipped to Power Platform. The People page is
the next piece, and it lands on a question the rest of the app has already
answered inconsistently: **what is a person, and which id are we holding?**
This checkpoint writes down the answer so the People work does not reopen it.

## Where things stand

- **Shipped**: search moved into the header and sized for it; the Home hero now
  leads with the four metrics; the Ideas/Solutions/People nav pills were added
  and then deliberately removed — search is the one discovery surface, and a
  second row of destinations pointing at the same rows was redundant.
- **`view === "people"` renders a placeholder.** The `View` union carries
  `"people"`, nothing else behind it exists yet.
- Person identity is decided: **the ADO identity (UPN), not the Dataverse GUID.**
  No new cross-store join. The reasoning is below, because it is the part that
  looks arbitrary until you see which id each store actually holds.

## The two id spaces

Every person-shaped value in this app comes from one of two stores, and they do
not key on the same thing.

| Store | Key | What is keyed by it |
|-------|-----|---------------------|
| Azure DevOps | `uniqueName` (UPN, e.g. `ryan.brown@cyclotron.com`) | Idea author, solution owner, comment author, `CurrentUser.id`, role |
| Dataverse | `systemuserid` (GUID) | Votes, adoptions, participation, activity `actorId` |

`CurrentUser.id` is the ADO identity, and that is load-bearing rather than
incidental — [`dataverse/identity.ts:90-103`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts#L90-L103)
says so at length. Every ownership comparison the UI makes ("is this mine?") is
against a value that came off a work item, so putting the GUID there would make
those comparisons never match and would silently hide every "this is mine"
affordance. The GUID is still needed to stamp Dataverse writes, so it stays
reachable separately through `currentSystemUserId()`.

## How an ADO identity reaches the app

ADO returns identity fields as objects, not strings. One helper flattens them:

```ts
// workitems.ts:90-96 — "Identity fields arrive as an object; uniqueName is the stable handle."
function identity(...) {
  if (person.uniqueName) return String(person.uniqueName);
  // ...falls back to displayName
}
```

Everything person-shaped on the ADO side runs through it:

| Value | Source field | Where |
|-------|--------------|-------|
| `Idea.submittedBy` | `System.CreatedBy` | [`workitems.ts:250`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/workitems.ts#L250) |
| `Solution.ownerId` | `System.AssignedTo`, falling back to `System.CreatedBy` | [`workitems.ts:287`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/workitems.ts#L287) |
| `WorkItemFacts.submittedBy` | `System.CreatedBy` — "for the contributor union" | [`workitems.ts:367-368`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/workitems.ts#L367-L368) |
| Comment author | `createdBy.uniqueName ?? createdBy.displayName` | [`comments.ts:34`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/comments.ts#L34) |

**This means a person list needs no lookup.** Ideas, solutions, and comments
already carry the person key inline. A People directory is a distinct-values
pass over rows the app fetches anyway — not a query against a directory.

## What resolution exists, and in which direction

`resolveUsers` is the only bulk person lookup, and it goes **one way: GUID → name
and email.** [`identity.ts:136-154`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts#L136-L154)
maps input through `guid()` and filters on `anyOf("systemuserid", wanted)`, so a
UPN passed in is discarded before the query runs. It is best-effort by contract —
an id that will not resolve is simply absent, because name resolution must never
fail the list it decorates.

The current user is matched the other way by `findSystemUser`, on
`azureactivedirectoryobjectid` (the reliable join) or `domainname` (UPN fallback,
which can differ in case and, for guests, in domain), restricted to
`isdisabled eq false`. **That logic is currently reachable only for the signed-in
user** — there is no `resolveSystemUserIdByEmail(email)` for an arbitrary person.

So:

- **Ideas, solutions, comments** → already keyed by ADO identity. Directly usable.
- **Votes, adoptions, activity** → keyed by GUID. Can be *projected onto* an ADO
  identity via `resolveUsers` (GUID → email), but cannot be *filtered by* one
  without extracting `findSystemUser`'s clause builder into an email → GUID
  resolver.

## There is no user directory on either host

Worth stating plainly, because it shapes the design more than anything else.
There is no `IUserRepository` anywhere in `Momentum.Library`, no `/api/people`
route, and no `AppUser` table — and the Dashboard already surfaces the
consequence to users, explaining a missing figure with
["No user directory on this backend, so there is no denominator"](src/Momentum.Frontend/packages/ui/src/Pages/Dashboard/Dashboard.tsx#L125).
Contributor lists are derived instead: the .NET side tallies audit records by
actor, and the code app's `rankContributors()` does the same over
`cycai_activities`, keyed by GUID and truncated to a top 8.

**People are always derived, never looked up.** A directory is a distinct-values
pass over rows we already have; it is not a table read.

## Known gaps for the People work

1. **Display names are being thrown away.** `identity()` returns `uniqueName`
   and only falls back to `displayName` — so whenever a UPN is present, the
   friendly name that came down on the same ADO identity object is discarded.
   That is the cheapest source of display names for a directory: no Dataverse
   round-trip, no Entra. Capturing both is a small change at one helper.
   Without it, an ADO-derived person list is UPNs and nothing else, because
   `resolveUsers` cannot name it (wrong key — see above).
2. **No actor-scoped activity query.** `ActivityQuery` is
   `{ take?, subjectId?, subjectType? }` — no `actorId`, in the domain type, in
   any provider, or in the REST surface. `IAuditRepository` has `GetBySubject`
   and `GetRecent` and no `GetByActor`. A person's timeline needs this added.
3. **No single-person rollup.** `rankContributors` proves the tally is
   computable, but it is a whole-table scan truncated to a leaderboard, not a
   lookup by id.
4. **Email ids need URL encoding through the route seam.**
   `callTool.ts`'s parser does `path.split("/")` without decoding, so a
   percent-encoded UPN in a path segment arrives still encoded.

## Deliberately out of scope

- **Rich profile fields** — no avatar, team, title, or department. Only what
  `CurrentUser`/`UserRef`/`AppUser` already carry: id/email, display name, role,
  created date. Supplementing from Entra is a later conversation.
- **A cross-store identity join.** Dataverse-native counts degrade to zero when
  GUID resolution fails; the ADO-native counts (ideas, solutions, comments) still
  work, because they were never keyed on the GUID in the first place.
