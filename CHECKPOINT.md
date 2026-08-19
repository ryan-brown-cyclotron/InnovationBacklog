# CHECKPOINT — 2026-08-18

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

## Skill intake

**The function app side is done.** Three endpoints, two git hosts, two credential kinds, and
nothing in it needs Dataverse. What remains is all on the code app side, and it is listed at
the bottom.

### What exists

| Layer | Type | Does |
|---|---|---|
| Domain | `Skills/SkillPackage.cs`, `SkillValidation.cs` | The package and the report shapes |
| Application | `SkillValidator.cs` | Structural checks against the published Agent Skills frontmatter spec — `SKILL.md` at root, YAML frontmatter, name/description rules, body, contents |
| Application | `SkillPackageExtractor.cs` | Unpacks `.md`, `.zip`, `.skill` |
| Application | `SkillFrontmatter.cs` | Parse, and rewrite `name` for a rename at approval |
| Application | `MarketplaceManifest.cs` | Upsert a plugin entry in `.claude-plugin/marketplace.json`; `Create` for a fresh one |
| Application | `SkillIntakeService.cs` | The commit: destination, manifest, stale-folder cleanup, conflict retry |
| Application | `ISkillRepository.cs` | The four git operations intake needs. Host-agnostic — this is what makes a new host an adapter and nothing else |
| Application | `ISkillRepositoryProvisioner.cs` | Bootstrap: exists, create, seed. A **second** port, so nothing on the intake path can reach a repository create |
| Application | `SkillProvisioningService.cs`, `SkillRepositoryTemplate.cs` | Idempotent bootstrap, and the seed files |
| Infrastructure | `AzureDevOps/AdoGitSkillRepository.cs` | Both ports over the ADO Git REST API |
| Infrastructure | `GitHub/GitHubSkillRepository.cs` | Both ports over the GitHub REST API |
| Infrastructure | `Git/GitRest.cs` | The failure handling the two hosts share |
| Host | `Configuration/SkillsOptions.cs` | The `Momentum:Skills` section and its startup validator |
| Host | `Auth/PersonalAccessTokenHandler.cs` | PAT as ADO basic auth / GitHub bearer |
| Host | `Functions/SkillIntakeFunctions.cs` | `POST skills/validate`, `skills/commit`, `skills/provision` |

**286 tests passing.** Config reference is
[docs/reference/skill-intake-configuration.md](docs/reference/skill-intake-configuration.md);
the connector stub is `docs/stubs/api/skill-intake/` and now describes all three operations.

Verified: the host boots and registers all three endpoints, `skills/validate` answers
end-to-end over HTTP, and a bad `Momentum:Skills` section stops the host with both setting keys
named. **Not** verified against a live repository — see the last bullet.

Three things in there worth not rediscovering:

1. **A skill lands at `plugins/{segment}/skills/{solutionId}__{name}/`, and the folder name
   is the entire link** between a repository folder and the catalogue entry it came from.
   Nothing else is stored or kept in step. A double underscore because a single one is legal
   inside a skill name and the split back apart has to be unambiguous.
2. **A rename at approval is a MOVE, not just a frontmatter edit.** `BuildAndCommitAsync`
   lists the segment's whole skills root and deletes every folder matching
   `{solutionId}__` that is not the current destination, in the same commit. Listing only the
   new folder would leave the old one behind and the marketplace would publish the same
   solution twice under two names.
3. **Intake is plain HTTP, deliberately not an MCP tool.** Adopting a skill is not a decision
   an agent should be able to take, and a typed REST operation is what a Power Platform
   custom connector can describe. Base64 in JSON rather than multipart for the same reason —
   it costs about a third in size and it is what a connector understands.

### The function app's own configuration

`Momentum:Skills`, its own section — it used to be three properties on `McpOptions`
(`SkillsProject` / `SkillsRepository` / `SkillsDefaultBranch`) on the assumption that the skills
repository sat beside the backlog in the same ADO organization, reached with the same token.
Neither assumption holds any more. **Colons locally, `Momentum__Skills__…` as Azure app
settings.** Organization and project still fall back to `Momentum:Mcp:Ado*`, because the
repository usually does sit beside the backlog.

`Host` and `Auth` are read **at registration time**, not per request: they decide which adapter
and which HTTP handler get registered. Changing either is a restart. The whole difference
between committing as the caller and committing as a service credential is which
`DelegatingHandler` is on the client — neither adapter can tell.

Four things worth not rediscovering:

1. **An ADO PAT is basic auth with an empty username, not a bearer token.** As a bearer token
   ADO answers with a *redirect to a sign-in page* rather than a 401, so the failure arrives
   looking like a configuration problem somewhere else entirely. Every client here has
   `AllowAutoRedirect = false` for exactly that reason.
2. **`Auth=Caller` is refused on GitHub at startup, not silently downgraded.** On-behalf-of
   exchange produces Entra tokens; GitHub does not accept them. A deployment that meant to
   attribute each commit to its approver should find that out at boot, not from the commit
   history.
3. **A GitHub commit is four calls, not one.** ADO has a push endpoint taking a whole
   multi-file changeset; GitHub does not, and its Contents API writes one file per commit —
   forty commits for a forty-file skill. The adapter uses the Git Data API instead (tree →
   commit → move ref), which is also the only route that can express the **delete** a rename at
   approval requires. Text files go inline in the tree call so an all-markdown skill is still
   one request; binaries need a blob upload each, because inline `content` is UTF-8 only and a
   PNG sent that way *succeeds* and silently corrupts.
4. **A truncated GitHub tree listing is a hard failure.** Intake decides what to *delete* from
   that listing, so a short list does not mean "fewer files" — it means a stale folder survives
   a rename and the marketplace publishes one solution twice. Concurrency is equivalent on both
   hosts: the commit parents the tip that was read, so `force: false` on the ref update gives
   the same guarantee as ADO's `oldObjectId`.

`POST skills/provision` closes what was open question 3. Creates the repository if missing,
seeds `marketplace.json` / `README.md` / `.gitattributes` if missing, idempotent, safe on every
deployment. It **seeds only what is absent** — an existing manifest is left exactly as it is
even if the request names segments it lacks, because registering a segment is intake's job on
first use. `Provision-SkillsRepository.ps1` still works but is superseded; its manifest goes
through `ConvertTo-Json`, whose whitespace differs, so the first commit after it reformats the
file once.

`skills/validate` needs no credential and no repository at all — it is pure computation over the
uploaded bytes. It works before any of the above is configured, which is the point.

### Settled: the four open questions

The design hole was **where the package lives between validate and commit** — validation
happens when a contributor attaches a file, the commit happens on approval, possibly days
later, and there was nowhere for the bytes to sit in between. Settled:

1. **The package is stored as an annotation.** A Dataverse note row carries the upload;
   `notes` (`annotation` / `annotations`) is already in the registry and every `cycai_` table
   is provisioned with `HasNotes = $true`. Mechanics, traps and full source for the picker,
   adapter and lifecycle are in
   `C:\Users\RyanBrown\Projects\wealthspire-ticketing\.claude\skills\code-app-file-upload`
   — follow it rather than re-deriving. What it will save here specifically: the polymorphic
   `objectid_<logicalname>@odata.bind` form, never selecting `documentbody` in a list query,
   two-phase save because the parent must exist before the note does, and the org limits
   (`maxuploadfilesize`, default 5 MB, against base64's +33%; and `blockedattachments`, which
   is worth checking for `.zip` and `.skill` before building anything on top of them).
2. **The code app does not validate. A flag on the record does.** The app never calls
   `skills/validate` and never inspects the package. The record carries a validation flag,
   and when the solution's kind is `Skill` the app **polls** it. That keeps the app ignorant
   of skill format entirely — it uploads a file and watches a field.
3. ~~**The function app gets a provision endpoint.**~~ **Done** — `POST skills/provision`.
4. **Validation still runs twice, and that stays.** `CommitApprovedSkill` re-runs the same
   validation the flag reflects, because passing at upload is not permission to commit days
   later.

### What is left — all of it code app side

Nothing below is a function app change. The function app takes bytes and commits them; where the
bytes wait between validate and commit, and who tells it to commit, are the open questions.

- **Which row the annotation hangs off is NOT settled, and it is the first thing to answer.**
  Solutions are ADO work items; there is no `cycai_solution` table for `objectid` to bind to.
  This exact approach has already failed here once: attachments *were* Dataverse annotations
  written with **no `objectid`**, so every upload succeeded, attached to nothing, and reached
  Azure DevOps never — the paperclip looked like it worked because the upload did. That is
  why `ado/attachments.ts` exists and uses native ADO attachments instead. Read the header
  comment on that file before choosing.
- **Where the validation flag lives** — an ADO field on the solution work item, or a column
  on whichever Dataverse row holds the note. Follows from the above.
- **What writes the flag.** Something has to read the annotation, call the validator and
  write the outcome back. Not decided: a function triggered by the upload, a poll on the
  function side, or a plugin/flow on annotation create.
- **Nothing calls `skills/commit` on approval.** Per the standing approval model, a solution
  needs approval before anything ships; that path is unwired.
- **`Skill` is still hidden from the intake picker** —
  [`enums.ts:51-55`](src/Momentum.Frontend/packages/logic/src/domain/enums.ts#L51-L55) and
  [`ContributeModal.tsx:234`](src/Momentum.Frontend/packages/ui/src/Components/ContributeModal/ContributeModal.tsx#L234)
  renders `INTAKE_SOLUTION_KINDS` specifically to exclude it. Unhiding it is the last step,
  not the first: the form has nothing coherent to ask for until the upload field exists.
- **No commit has ever executed against a real repository.** The GitHub adapter is covered by
  wire-level tests against a recording handler, not by a real push; the ADO adapter has neither.
  The next thing to do here is the cheapest one available: set
  `Momentum:Skills:Auth=Pat` with a PAT, `POST skills/provision`, and `POST skills/commit` a
  one-file skill by hand. **That no longer needs the Azure DevOps OBO auth that was blocking
  this** — a PAT sidesteps it entirely, and it works against a scratch GitHub repository just as
  well. Also still unverified: whether the custom connector is deployed past stub.

---

## Solved: the Dataverse blocker was a WRONG TENANT, not withdrawn access

The last checkpoint recorded `403 0x80072560` — "The user is not a member of the
organization" — and concluded that access had probably been withdrawn. **That conclusion was
wrong, and the error message is why.**

A token minted for the wrong Entra tenant is a perfectly valid token. Dataverse therefore
does not answer 401; it answers **403 `0x80072560`**, which reads as "you were removed"
rather than "you asked the wrong directory". A whole checkpoint went hunting for a revoked
invitation.

Every environment answers this question itself, on an unauthenticated request:

```
GET https://<org>.crm.dynamics.com/api/data/v9.2/WhoAmI    401
WWW-Authenticate: Bearer authorization_uri=https://login.microsoftonline.com/<TENANT>/oauth2/authorize
```

Run against both:

| Org | Tenant it trusts |
|---|---|
| `cyclotrondev` (the deploy target) | `6583636b-d156-492e-86ce-b8fccb790df1` |
| `org9ceb01a6` (the old playground) | `a6e7984c-0911-419d-8880-b444490ad520` |

`az` was active on `b9894c34`, which is **neither**. `Ryan.Brown@cyclotron.com` is a member
of all three, so nothing had been revoked — the CLI was simply pointed elsewhere.

`Provision-DataverseSchema.ps1` had the same bug baked in: `Get-DataverseToken` called
`az account get-access-token --resource <org>` with **no `--tenant`**, so it minted for
whatever directory happened to be active. It now discovers the tenant from the org's own 401
challenge (`Get-DataverseTenant`), passes `--tenant`, and refuses to silently fall back —
falling back is what made this undiagnosable the first time. `-Tenant` overrides.

**Reaching Dataverse is: `az account get-access-token --tenant <from the challenge> --resource <org>`.**

### Still blocked: Azure DevOps

`dev.azure.com/CyclotronInc` is untouched by this and was not re-tested here. The ADO items
below still stand.

### What is waiting on it

Everything below is built and compiles; these are the claims a token would turn from derived
into measured, in order:

1. **Re-capture the HAR for solution 4462** and count. The 14 → 8 and four-waves → two below
   are reasoned from the call sites, not observed.
2. **Run one WIQL.** `CONTAINS WORDS` has still never executed. If full-text search is not
   enabled on the collection, Azure DevOps rejects it with a 400 and `search` surfaces the
   error body.
3. **Round-trip the engagement `$batch`.** Its wire format is unit-tested; the exchange with
   the real service is not. **Now unblocked** — Dataverse is reachable; this needs doing.
4. **Confirm `updates` carries the decision rationale.** `listDecisions` now reads deltas,
   which assumes State and DecisionRationale arrive on the same revision — true of how
   `transition` writes them, unverified against a real work item. (Azure DevOps.)
5. ~~**Add `Withdrawn` to `cycai_adoptionstatus`.**~~ **DONE against `cyclotrondev`.**
   Dataverse allocated `100000003`, matching `AdoptionRow.WithdrawnValue` exactly.
   `IsWithdrawn` still fails safe if an environment ever differs, treating an unrecognised
   value as *not* withdrawn.

---

## Done: opening a solution cost 14 calls

Measured before the change from `apps.powerapps.com.har`, opening solution **4462**:
**14 data calls** (4 telemetry beacons excluded), **3763ms wall**, **7152ms of summed
request time**, in **four sequential waves**:

```
wave 0   t=0      1 call    468ms   getSolution — workitems/4462?$expand=relations
wave 1   t=1000   1 call   1557ms   workitems/4462/revisions          <- longest single call
wave 2   t=2000   9 calls   598ms   the six-way Promise.allSettled, fanned out
wave 3   t=3000   3 calls   763ms   the two-hop's second leg
```

Five things were being paid for twice or in pieces, and all five are fixed.

### `revisions` was fetching a field nothing renders

The 1557ms wave-1 call existed to set `Solution.publishedAt` — the revision on which State
first became Published. **No component reads that field.** A grep across `apps/` and
`packages/` finds it in the domain type, the memory provider, the generated contract, and
the code that fetched it. Nowhere else.

So the call is gone rather than deferred, and `publishedAt` stays null exactly as every list
read already left it. `stateReachedAt` went with it. **Wave 1 no longer exists.**

`listDecisions` was the other revisions reader and it *is* rendered, so it moved to
`_apis/wit/workitems/{id}/updates` — field deltas instead of whole snapshots. That also
removed the loop's state-comparison: a revision list repeats the state on every later edit,
so "the revision that changed it" had to be inferred, whereas on an update the field is
simply absent unless that revision set it. It rests on `transition` writing State and
DecisionRationale in one patch, which is now stated in the code.

### The same work item was read three times

`getSolution`, `listLinkedIdeas` and the comment-attachment lookup each issued
`workitems/4462?$expand=relations`, none of them aware of the others. Every ADO call funnels
through `send()` in
[`ado/client.ts`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/client.ts),
so a read cache there fixes all three at once with no call-site changes:

- keyed on method + URI + body, with **in-flight sharing** and a **5s retention window** —
  sized for one panel open and nothing longer;
- **reads only.** `get` always, plus a new `AdoClient.read()` for the two POSTs that are
  really reads (`wiql`, `workitemsbatch`). `post`, `patch` and `upload` stay uncached and
  **flush the cache outright**, so a read-after-write never sees what it replaced;
- a rejection is never retained.

### Three `workitemsbatch` POSTs carried one id each

`[4472]` an issue, `[4454]` a linked idea, `[4473]` a milestone — three round trips, three
projections. `createWorkItemLoader` in
[`ado/workitems.ts`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/ado/workitems.ts)
now owns the two-hop: `list(wiql, fields)` and `hydrate(ids, fields)`, with hydration
collecting every id requested in the same tick into ONE batch over the union of the ids and
the union of the projections. One loader for the whole adapter, built in `provider/index.ts`
— coalescing only works across call sites that share it.

It sends `errorPolicy: "omit"`, which matters more now than it did: a merged batch carries
ids from callers that know nothing about each other, so one unreadable item would otherwise
fail three lists instead of dropping one row from one.

`createWorkItemFacts` stays outside the loader and cannot join it — it asks for
`$expand=Relations`, which the endpoint refuses to combine with `fields`.

### Two WIQL queries differed only by work item type

`listIssues` and `listMilestones` now share one `children(solutionId, type, fields)` that
builds a single query text, byte for byte, whichever list asks for it:

```
[System.Parent] = 4462 AND [System.WorkItemType] IN ('Issue','Milestone')
  AND [System.State] <> 'Cancelled'
```

So the cache collapses the pair into one request and the loader merges the two hydrations
that follow. The `Cancelled` exclusion is `deleteMilestone`'s tombstone and is safe for both
types: `Issue` inherits Basic's To Do / Doing / Done and has no Cancelled state to hide.
Type filtering and ordering moved to the rows — milestones already re-sorted client-side
with `compareMilestones`, and issues gained the same treatment in place of their `ORDER BY`.

### The same person was resolved twice

`systemusers?$filter=(systemuserid eq 'c2c73a3d-…')` was fetched byte for byte twice, once
for activity actors and once for adoption starters. `resolveUsers` in
[`dataverse/identity.ts`](src/Momentum.Frontend/apps/code-innovation-backlog/src/provider/dataverse/identity.ts)
now memoizes **per GUID, not per query** — it asks only for ids nobody has asked for yet, so
a partial overlap shrinks the query instead of missing the optimization entirely, and
concurrent callers share one lookup per id. An id that matches no row is remembered as
absent; a *failed* lookup is not remembered, because an unreadable table is not a missing
person. Session lifetime is right for a display name and would not be for engagement.

### And the fan-out no longer waits for the record

`openDiscovery` awaited the detail read, then fanned out — but the fan-out only ever needed
the id, which the caller already held. The loading half of `openSolution`/`openRequest` is
now `loadSolutionDetail`/`loadRequestDetail`, started alongside the record's own read and
passed in as a promise rather than tracked in a ref, so it cannot get out of step with the
panel. The "not asked yet" reset moved into the loader's start — left in the opener it would
have run *after* an early fan-out answered and blanked the tabs it had just filled.

### Every mutation reloaded the whole panel, and evicted the tab you were on

Found by using the deployed app, and it was not a flicker. `onRefresh` reloaded all six
routes and set `issues` and `milestones` to `undefined` first — but an undefined `issues`
means "this backend has no issues capability", so
[`SolutionPanel.tsx:224`](src/Momentum.Frontend/packages/ui/src/Components/SolutionPanel/SolutionPanel.tsx#L224)
**removes the Issues tab**, and the guard below it falls back to Overview when the active
tab disappears. Reporting an issue from the Issues tab threw the reader to Overview and
spent nine calls doing it. Adding a milestone unmounted the roadmap the same way.

Two changes, and the first is the bug:

- **Blanking only happens when a DIFFERENT solution is arriving** — `loadSolutionDetail(id,
  { fresh: true })`. A refresh is looking at the same solution and must never take a tab
  away from somebody standing on it.
- **Each mutation names what it changed.** `onRefresh("milestones")` reloads milestones and
  activity, and nothing else; `SolutionRefresh` in `SolutionPanel.tsx` carries the
  vocabulary. Activity is in every entry because every mutation writes an activity row.
  `onRefresh()` still defaults to `"solution"` — a full reload — which is the safe direction
  for the two record-level cases (patch, accept/reject).

Adding a milestone went from **9 calls to 2**. It also skips `workspace.load()`: rollups
count Related links and `System.CommentCount`, and milestones hang off a Parent link, so
nothing the list behind the panel shows can have moved. Links, comments and adoptions do
still refresh it.

The idea panel has the same reload-everything shape but not the bug — `loadRequestDetail`
never writes `undefined`, so no tab disappears. It is four wasted calls per comment, not a
visible reset, and it is untouched.

### Where that leaves it

| | Before | After |
|---|---|---|
| Calls per solution open | 14 | **8** |
| Waves | 4 | **2** |
| Longest single call | 1557ms (`revisions`) | gone |
| Calls to add a milestone | 9 | **2** |

The eight: the solution read, the comment list, the child WIQL, the activity feed and the
adoption rows go out together; then the linked-idea hydration, the merged child hydration
and one `systemusers` lookup. Opening an **idea** is fixed by the same mechanisms — three
identical work item reads become one, and its decision history stopped pulling whole
revisions.

**Not the 7 this checkpoint previously targeted**, and the reason is worth keeping: the
linked-idea hydration cannot merge with the child hydration. Linked ideas hydrate off
relations already in hand; the children hydrate only after their WIQL returns. They are
inherently one round trip apart.

**The 8 is derived, not measured.** Both backends still refuse to authenticate (below), so
the HAR could not be re-captured. Counting it is the first thing to do when sign-in works.

### Answered: multi-GET `$batch` is NOT reachable from the code app

The last open question here — whether the four single-GET Dataverse batches could become one
— has an answer, and it is no. Do not re-investigate:

The app never builds the `$batch` envelope. The SDK stamps a **`BatchInfo` header**
(`baseUrl`, `encodedPath`, `headers`, `batchId`) onto each request and the Power Platform
proxy expands it —
`@microsoft/power-apps/dist/internal/data/core/runtimeClient/runtimeDataClient.js:295-313`.
Several GETs would merge only if they shared a `batchId`, which lives on the private
`IOperationContext`; `batchId` is **read** there and **set nowhere** in the package, and no
public method accepts a context (`IGetAllOptions` has no seam, `retrieveMultipleRecordsAsync`
takes options only). The one escape hatch is `setDataOperationExecutor`, which means
replacing the executor and with it the proxy's auth and protocol semantics. Not worth it for
two calls.

## Done: the MCP server took the batch the code app cannot

`Momentum.Mcp` speaks the Dataverse Web API directly, so `$batch` genuinely is available to
it. `EngagementReader`'s four parallel GETs — votes, participation, momentum, adoptions —
are now **one POST**.

`Backlog/DataverseBatch.cs` is the wire format as pure string handling, and pure on purpose:
it is the only part that can be got subtly wrong in a way no compiler notices (a missing
blank line between a part's headers and its request line makes the whole batch a 400), and
the only part testable without a tenant. `BackendJson.BatchGetAsync` posts it;
`Describe`/`ExtractDetail` were pulled out of the response path so a read that failed
**inside** a batch reads exactly as it did when it was its own request.

Failure semantics are unchanged, which was the constraint: the outer POST answers 200 even
when every part was refused, so each part becomes its own `BackendResult`. Votes still decide
the outcome; an unreadable participation, adoption or rollup still degrades to a note rather
than to a zero.

`BacklogTools.Get` is now **2 waves and at most 3 calls** — one work item, one hydration of
its links, one engagement batch. 10 new tests, 239 passing, 0 warnings.

---

## Done: the permission review

Three of the four findings were places where the affordance and the enforcement disagreed,
and one was a rule with no enforcement at all. The rules are now these, and they live in
[`domain/enums.ts`](src/Momentum.Frontend/packages/logic/src/domain/enums.ts) rather than in
each component:

| Actor | May |
|---|---|
| Approver / Administrator | Everything |
| Idea author, solution owner | Manage their own item |
| Adoption setter | Manage their own adoption row — stage **and** withdrawal |
| Anyone who can see an item | Comment, vote, report an issue, **link an idea** |

`canEditIdea` and `canManageAdoption` join `canEditSolution` and `canSetIssueStatus`; all
four delegate to one `ownerOrReviewer`. **Enforcement is in the code app only** — the
affordance plus the provider's own check. No ADO process rules and no Dataverse security
roles, which is what the existing "NOT A SECURITY BOUNDARY" notes already said.

### `updateIdea` had no check at all

Anyone who could see an idea could rewrite its title, description and tags — and on an Idea
the `pipeline:` tag is what `withPipeline` reads to derive the STATUS, so a stranger editing
a tag could reset an idea's pipeline stage. `updateSolution` next door had
`requireSolutionEditor` the whole time; the idea side had nothing, in either the ADO adapter
or the memory provider. Both now have `requireIdeaEditor` / `canEditIdea`.

It costs no round trip: `updateIdea` already read the work item on the tags path, so the
check reuses that read (and the 5s read cache in `ado/client.ts` covers the rest).

### Any viewer could move any adoption's stage

The `<select>` in `AdoptionTab` was ungated and `dataverse/engagement.ts` had no role check
anywhere in it, so a passer-by could move somebody else's adoption from Exploring to Using.
Now the select renders only for people who may use it; everyone else gets the flat pill the
settled rows already used, so the list reads the same and simply offers less.

`startAdoption` stays open, on `createIssue`'s stated reasoning: recording that your team
uses something is an inbound signal, and gating it loses the signal rather than deferring it.

### "The setter" was not expressible, and that was the real blocker

`Adoption.startedBy` is a Dataverse systemuser GUID; `CurrentUser.id` is an ADO UPN. The old
`usesThis()` said so itself and fell back to matching display names, documented as "used
only to show a badge, never to gate an action" — which is exactly why the rule above could
not be written yet.

**`Adoption.startedByMe` is now resolved by the provider**, where both ids are GUIDs, on the
precedent `VoteSummary.votedByMe` set for the same reason. The display-name fallback is
gone rather than kept as a backstop: it was wrong in both directions — two people sharing a
name matched, an unresolved name did not. Absent flag means read-only, which is the safe
way to be wrong about a permission.

In the memory provider the flag is derived on read from `AdoptionRow`, deliberately not
stored, so a seeded row cannot assert whose it is.

### Linking is open; unlinking is not

`linkSolution` required a reviewer while `OverviewTab` offered the button to owners too, so
an owner was invited to do something that could only fail. Azure DevOps now goes ahead and
links — seeing both items is the gate, as with `createIssue`.

`unlinkSolution` moved the other way, to owner-or-reviewer, and is keyed on the **solution**
rather than the idea: the link is a claim about what that solution answers. Adding a claim is
cheap and reversible; removing somebody else's leaves nothing behind but an activity row.
`LinkedItems` gained `canUnlink` so the button stops appearing for readers who cannot use it.

Link review is no longer deferred — see below.

## Done: an adoption can be withdrawn

Settled as a **withdrawal**, not a delete: `AdoptionStatus` and `SolutionUseStatus` both
gained `Withdrawn`, `EngagementProvider` gained `withdrawAdoption`, and `callTool.ts` routes
`POST .../use/{id}/withdraw`. Not `DELETE` — the row is retained, and a real delete would
silently change every historical rollup that counted it. Same shape as
`withdrawParticipation` next door and as `deleteMilestone`'s `Cancelled` tombstone.

Three details worth not rediscovering:

1. **`completedAt` is never stamped.** That timestamp is what the rollups read to mean
   "rolled out", and a withdrawal is the opposite claim. Stamping it would turn "we stopped"
   into "we finished" in every count.
2. **A withdrawn row counts in NOTHING** — not `adoptions`, not `teams`, not the
   active/completed split — in `adoptionFacts`, in the memory provider's rollup, and in the
   MCP server's `Adoptions()`. It is not merely "not active": a withdrawal never stamps a
   completion timestamp, so anything splitting on the timestamp alone would file it as
   active for ever. The MCP read also stopped asking for `$count`, because the server would
   have counted the withdrawn rows and the code cannot correct a number it did not compute.
3. **`cycai_adoptionstatus` had to be added to two `$select`s.** This is the trap
   `_cycai_voterid_value` already documents: a field omitted from `$select` is *absent* from
   the row, not null, so it falls back to `Exploring` — and every withdrawn adoption would
   have silently counted as an active one. The MCP `AdoptionRow.IsWithdrawn` deliberately
   does NOT treat a null status as withdrawn, for the mirror-image reason: failing that way
   would erase every adoption the day somebody trimmed a projection.

Reads never depend on the choice's integer value — withdrawn rows are filtered after
mapping, by name — so `listAdoptions` and the rollups keep working before the schema change
below lands. Only the write needs it.

**The schema change landed**, in `cyclotrondev` (the deploy target — see the tenant note
above). Dataverse allocated `Withdrawn` the value **`100000003`**, matching both
participation's own Withdrawn and the `AdoptionRow.WithdrawnValue` constant the MCP server
hardcodes. `Cycai_adoptionsModel.ts` is regenerated and carries it.

`Ensure-GlobalChoice` had to be fixed to make that possible, and the bug it had is worth
knowing about: it returned early whenever the choice already existed, so its `-Options` list
was authoritative **only for an environment that did not have the choice yet**. Adding a
value and re-running was a silent no-op — the script printed "Exists" and the option never
appeared. It now reconciles, adding declared options that are missing via `InsertOptionValue`
and never deleting or relabelling one, so existing integers cannot move under the generated
models.

### Verified

**Offline** — 46 checks in `packages/logic/verify.mjs`, including the one outcome that
separates `canManageAdoption` from `canEditSolution`: the solution's own owner is refused
withdrawal of somebody else's adoption of it. Plus 244 .NET tests, 0 warnings.

**Against live Dataverse** (`cyclotrondev`), the whole withdrawal path, end to end:

| Step | Result |
|---|---|
| Create an adoption | status `100000000`, `_cycai_startedbyid_value` = caller |
| The permission read's `$select` | returns the lookup, so `startedByMe` resolves — the join works |
| Withdraw (status only) | status `100000003`, **`cycai_completedon` still null** |
| The rollup's `$select` | `cycai_adoptionstatus` present on the row, so withdrawn rows are excludable |

The middle two are the ones that could not be proven by unit tests: the lookup is only
present because it is named in the `$select`, and the null `completedon` is what keeps a
withdrawal from being counted as a finished rollout.

**Deployed** — the code app is pushed to `cyclotrondev` as part of the `InnovationBacklog`
solution.

## Done: idea→solution links are approved, not assumed

**Three things need approval: ideas, solutions, and the links between them.** The third
kept getting lost. It was designed out once — `IdeaSolutionLink` was made deliberately
attribute-free, and the Dataverse table deleted, on the reasoning that "linking is a
reviewer action, so there is no pending state and nothing to classify". That premise died
the moment linking became open, and nothing noticed.

The division of labour, which is the whole design:

| | Holds |
|---|---|
| **Dataverse** (`cycai_link`) | The PROPOSAL. Pending / Approved / Rejected, who proposed, who decided, why. |
| **Azure DevOps** | APPROVED TRUTH ONLY. The `Related` relation is written at the moment of approval and never before. |

So proposing writes nothing to ADO. **A pending link is invisible in Azure DevOps, by
explicit decision** — do not "fix" that with a provisional link, tag or comment. It is what
lets `listLinkedSolutions` and every other reader of ADO relations stay correct with no
approval filter of its own, and the filter that never gets forgotten is the one that does
not have to exist.

That mattered more than it sounds: **`listLinkedSolutions` hydrates related ids and filters
on work-item TYPE only** — it never consulted `catalogClause`. While linking was open and
immediate, anyone could put an unapproved solution's title on a popular idea's panel. There
is now no ADO link to surface until a reviewer agrees, so the hole is closed structurally
rather than by a second filter.

### The UI was already built

`Approvals.tsx` has had a links queue — tab, "`<solution>` answers `<idea>`" cards, decision
form — the whole time, and `useApprovals` has been calling `/api/approvals/links` and
`/api/requests/{id}/links/{sid}/{accept|reject}`. Both routes were **stubs**: `return []` and
`return null`. This work filled them in; almost nothing in the UI had to change.

### Four decisions worth not rediscovering

1. **The ADO write happens AFTER the decision is recorded.** If the patch fails, the row
   reads Approved with no relation — visible in history, absent from the catalogue,
   re-approvable. The other order creates a live link nobody is recorded as having
   approved, which is the exact failure this design exists to prevent.
2. **Deciding twice is refused**, not idempotent. A second approval would re-stamp the
   decider and the date over somebody else's decision.
3. **Re-proposing a REJECTED pair returns the rejection**, it does not reopen it. Reversing
   a reviewer is a decision, not a side effect of clicking Connect again.
4. **Unlinking deletes the row rather than reverting it to Pending.** An unlink is not a
   proposal; putting it back in the queue would ask a reviewer to approve something nobody
   asked for. The pair can simply be proposed again. The delete is unconditional, outside
   the "was there an ADO relation" guard, because a decided row with no relation is exactly
   what an interrupted approval leaves behind and this is the call that repairs it.

`cycai_link_unique` over the link key makes proposing twice a platform conflict rather than
a read-then-write race — the same arrangement as `cycai_vote_unique`, and the conflict is
treated as success because "already proposed" is what the person wanted.

### Verified

**Offline** — 58 checks in `packages/logic/verify.mjs` (up from 46), covering the whole
lifecycle: propose → queue → approve, reject, decide-twice, re-propose-a-rejection,
unlink-then-repropose, and the reviewer/non-reviewer split on both the queue and the
decision.

**Against live Dataverse** (`cyclotrondev`): propose lands Pending; a duplicate is refused by
the alternate key (`0x80060892`); the queue filter and its per-idea narrowing both return the
row; approving stamps state, decider and rationale and drops it out of the queue.

**Deployed** to `cyclotrondev`.

### Known gap

The proposer sees their pending proposal on the **idea** panel ("Waiting for review", dashed
row). The **solution** panel's "Ideas this supports" shows approved links only — a proposal
made from that side is invisible to the person who made it until it is approved. Same fix as
the idea side: `listProposedLinks` keyed by solution rather than idea.

## One gap left in the solution panel

Found by using the deployed app. Not a regression — surface that was never built, recorded
because the symptom and the cause are one step apart.

### An issue's description is written and can never be read

The report form asks for one — "What did you expect, and what happened instead?" — and
[`IssuesTab.tsx:114`](src/Momentum.Frontend/packages/ui/src/Components/SolutionPanel/IssuesTab.tsx#L114)
collects it. It is stored in `System.Description`, mapped by `toSolutionIssue`, fetched on
every panel open as part of `ISSUE_FIELDS`, and **rendered nowhere**. The table has five
columns — ID, Title, State, Assigned to, Updated — no row expansion and no click handler.
`reportedBy` is fetched too and used only to decide whether the status control is editable;
the reporter's name is never shown either.

So the one field that carries what actually went wrong is write-only. That makes the issues
channel a title-only channel in practice, which is not what the form promises.

This is the same class of finding as `publishedAt` above and the exact inverse: that one was
a field fetched at real cost and never rendered, this one is a field captured from a person
and never rendered. Both were invisible until someone read the surfaces end to end.

The smallest honest fix is a disclosure row: the description and the reporter under the
title, no new call — the data is already in hand on every open.

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

## Done: the config drift is cleared

The root `Dockerfile` named `sdk:9.0` / `aspnet:9.0` and `src/Momentum.Contracts/tgconfig.json`
pointed TypeGen at `bin/Debug/net9.0/Momentum.Contracts.dll`. Both now say 10.0, which is what
`Directory.Build.props` (`net10.0`) and `global.json` (SDK `10.0.302`) have said all along.

Why it failed quietly rather than loudly: a stale `bin/Debug/net9.0/` directory was still on
disk, so TypeGen found *an* assembly and generated from the old one. That directory is
deleted. If the path ever goes stale again it will now fail with a missing file.
