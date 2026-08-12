# Azure DevOps API Surface

> Validated 2026-08-11 against Microsoft Learn: WIQL syntax reference, Query By Wiql (REST 7.1), Work Item Tracking REST overview, Queries REST API.

Base: `https://dev.azure.com/{organization}/{project}/_apis/`
All calls carry the user's **OBO ADO token** → project/org permissions enforced automatically (WIQL requires the user's `View work items` permission).

Target: basic querying + **tag-based filtering** of work items. ADO's querying is a deliberate **two-step** — this drives the tool design.

## `read_query` — structured work-item query (the two-hop)

### Step 1 — WIQL (returns IDs only)

**Endpoint:** `POST /_apis/wit/wiql?api-version=7.1` (org/project/team-scoped variants exist)

```jsonc
POST https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1
{
  "query": "SELECT [System.Id], [System.Title], [System.State], [System.Tags] FROM WorkItems WHERE [System.TeamProject] = 'MyProject' AND [System.WorkItemType] = 'User Story' AND [System.State] = 'Active' ORDER BY [System.ChangedDate] DESC"
}
```

⚠️ **WIQL returns only work-item IDs**, regardless of the SELECT column list — the columns inform result metadata only.

Options: `?$top={n}` cap; `?timePrecision=true`; WIQL is case-insensitive; `ASOF 'yyyy-MM-dd'` supports point-in-time queries.

### Step 2 — hydrate the IDs

**Endpoint:** `GET /_apis/wit/workitems?ids=...&fields=...&api-version=7.1`

```
GET https://dev.azure.com/{org}/_apis/wit/workitems
    ?ids=297,299,300
    &fields=System.Id,System.Title,System.State,System.Tags
    &api-version=7.1
```

**Bake both hops into one tool** so the agent sees a single `list_work_items(...)` call, never the WIQL→IDs→hydrate plumbing.

> **Saved-query alternative:** `GET /_apis/wit/queries?$filter=&$expand=` to discover stored queries (returns the query hierarchy incl. WIQL text with `$expand=Wiql`), then execute by ID. Useful if you'd rather govern query *definitions* inside ADO than embed raw WIQL in server code.

## Tag-based filtering

Tags are the `System.Tags` field — filter in WIQL:

```sql
SELECT [System.Id], [System.Title], [System.Tags]
FROM WorkItems
WHERE [System.Tags] CONTAINS 'skill:PowerAutomate'
  AND [System.State] = 'Active'
```

- `CONTAINS` is the tag-matching operator.
- Tags are **semicolon-delimited** in storage (`Tag1; Tag2`).
- No separate endpoint needed — tag filtering rides inside WIQL.

**List all tags** (to build/validate filter values):
```
GET /_apis/wit/tags?api-version=7.1
```

## `search` — free text

Two options:

**Option A — WIQL `CONTAINS` / `CONTAINS WORDS`** (no extra dependency)
```sql
WHERE [System.Title] CONTAINS WORDS 'statement of work'
```
Field-scoped matching. Sufficient when "search" means "filter by known fields."

**Option B — Search extension API** (full-text relevance)
```
POST https://almsearch.dev.azure.com/{org}/_apis/search/workitemsearchresults?api-version=7.1
```
Relevance-ranked search across work items. **Requires the Search extension installed on the org**, and note the different host (`almsearch.dev.azure.com`). Only reach for this if field-scoped WIQL isn't enough.

## `describe` — schema / metadata

```
GET /_apis/wit/fields?api-version=7.1                     # all work-item fields (reference names)
GET /_apis/wit/workitemtypes?api-version=7.1              # work item types in a project
GET /_apis/wit/workitemtypes/{type}/fields?api-version=7.1
GET /_apis/projects?api-version=7.1                       # org-level: list projects
```

Field reference names (`System.Id`, `System.Tags`, `Microsoft.VSTS.Common.Priority`, …) are what WIQL and the hydration `fields=` parameter expect.

## Capability → endpoint summary

| Domain capability | ADO call(s) |
|---|---|
| read_query (filtered/tagged) | `POST wiql` → `GET workitems?ids=&fields=` |
| tag filter | WIQL `[System.Tags] CONTAINS 'x'` |
| search (field-scoped) | WIQL `CONTAINS WORDS` |
| search (relevance) | `POST almsearch …/workitemsearchresults` (extension required) |
| describe / schema | `GET _apis/wit/fields`, `_apis/wit/workitemtypes`, `_apis/projects` |
| list tags | `GET _apis/wit/tags` |
| saved queries | `GET _apis/wit/queries` (+ run by ID) |

## Auth header

```
Authorization: Bearer <ado-obo-token>
```
Under OBO you send an Entra bearer token — not a PAT. (PAT/Basic remains a local/legacy fallback pattern only; irrelevant to this design.)

## Notes for tool design

- The **two-hop is the only real asymmetry** vs. Dataverse — hide it behind a uniform tool contract.
- Field/type metadata (`describe`) is org/project-level → cacheable server-wide (respect project visibility).
- WIQL/work-item results reflect the user's permissions → per-user; don't cache across users.
- If enabling relevance search, account for the second base URL (`almsearch.dev.azure.com`) in HttpClient config.
