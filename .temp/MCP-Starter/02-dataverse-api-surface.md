# Dataverse API Surface

> Validated 2026-08-11 against Microsoft Learn: Search records with query API, Query table definitions (Web API), Retrieve metadata by name/MetadataId, Dataverse search overview.

Base: `[Organization URI]/api/data/v9.2/`
All calls carry the user's **OBO Dataverse token** → row-level security enforced automatically by Dataverse.

Maps the three target capabilities (`search`, `describe`, `read_query`) onto concrete REST endpoints.

## `search` — keyword / relevance across records

**Endpoint:** `POST [Organization URI]/api/data/v9.2/search/v2.0/query`

Relevance search (Azure Cognitive Search-backed). Request/response contract is the same as the search Web API; only the URL differs.

Body fields:
- `search` — the term
- `entities` — which tables (with optional per-table filters and orderby; table-specific `orderby` columns allowed when the query filters to a specific table type)
- `filter` — top-level filter for common cross-entity columns (`createdon`, `modifiedon`). Syntax: `<attribute logical name> <filter>`
- `top` / `skip` / `count` — paging. Default 50 results returned; `top` caps at **100**; common pattern is `top=10` + `skip` per page
- `options` — search-behavior settings

Response: an (escaped-JSON) payload whose `Value` array contains `QueryResult` items (each = a Dataverse record); facet results report counts per range/value/interval.

**Related endpoints (same path family):** `/suggest`, `/autocomplete`, plus statistics/status endpoints.

**Config dependencies (matter at runtime):**
- Searchable columns per table = the table's **Quick Find view** columns (view definition lives in `SavedQuery` and is programmatically updatable).
- Table must be **sync-enabled to the search index** (`SyncToExternalSearchIndex` on `EntityDefinitions`).
- Dataverse Search enforces its own **lower throttle limits**, separate from standard Web API service-protection limits — budget accordingly.

## `describe` — schema / metadata

Dataverse is metadata-driven; query definitions at runtime via the `EntityDefinitions` entity set.

**List tables (lean projection):**
```
GET /api/data/v9.2/EntityDefinitions?$select=LogicalName,DisplayName,EntitySetName
```

**One table + columns:**
```
GET /api/data/v9.2/EntityDefinitions(LogicalName='account')?$expand=Attributes
```

**Batch several tables in one call (perf):**
```
GET /api/data/v9.2/EntityDefinitions
    ?$select=LogicalName,DisplayName
    &$filter=Microsoft.Dynamics.CRM.In(PropertyName='LogicalName',PropertyValues=['account','contact','lead'])
    &$expand=Attributes
```
Use `In(...)` instead of a chained `LogicalName eq 'a' or …` — documented case of a 10-table metadata pull dropping from ~5s to ~0.2s.

**Choice sets (global option sets):**
```
GET /api/data/v9.2/GlobalOptionSetDefinitions
GET /api/data/v9.2/GlobalOptionSetDefinitions(<MetadataId>)
GET /api/data/v9.2/GlobalOptionSetDefinitions(Name='incident_caseorigincode')
```
⚠️ This path does **not** support `$filter`. Fetch all, or retrieve one by `Name`/`MetadataId`. A column's option set is also reachable via the `GlobalOptionSet`/`OptionSet` navigation properties on enum attribute metadata:
```
GET /api/data/v9.2/EntityDefinitions(LogicalName='account')/Attributes(LogicalName='accountcategorycode')
    /Microsoft.Dynamics.CRM.PicklistAttributeMetadata
    ?$select=LogicalName&$expand=OptionSet($select=Options),GlobalOptionSet($select=Options)
```

**Metadata `$filter` on enum-typed properties** — prefix the enum namespace:
```
GET /api/data/v9.2/EntityDefinitions?$select=LogicalName
    &$filter=OwnershipType eq Microsoft.Dynamics.CRM.OwnershipTypes'UserOwned'
```
(For complex-type properties, filter on the path to the underlying primitive, e.g. `CanCreateAttributes/Value eq true`.)

## `read_query` — structured record retrieval (with tag/status filtering)

**Endpoint:** `GET [Organization URI]/api/data/v9.2/{entitysetname}?...`

Standard OData query — the parameterized structured read.

```
GET /api/data/v9.2/{entitysetname}
    ?$select=<cols>
    &$filter=<predicate>
    &$orderby=<cols>
    &$top=<n>
    &$expand=<navprops>
```

- **Tag / status filtering is native `$filter`:** `$filter=statuscode eq 1 and _ownerid_value eq <guid>`
- **Related rows via `$expand`** (e.g. votes/adoption children alongside a parent record)
- **Projection via `$select`** — only the columns the tool needs

## Capability → endpoint summary

| Domain capability | Dataverse call |
|---|---|
| search (keyword/relevance) | `POST search/v2.0/query` |
| describe / schema | `GET EntityDefinitions` (+ `$expand=Attributes`, `In(...)` batch) |
| read_query (filtered) | `GET {entityset}?$filter=&$select=&$expand=` |
| tag / status filter | OData `$filter` on choice/lookup/status columns |
| choice-set lookup | `GET GlobalOptionSetDefinitions` (no `$filter`) |

## Headers (typical)

```
Accept: application/json
OData-MaxVersion: 4.0
OData-Version: 4.0
Authorization: Bearer <dataverse-obo-token>
```

## Notes for tool design

- `describe`/metadata output is **not user-scoped** → cacheable server-wide.
- `search` and `read_query` results **are** user-scoped → don't cache across users.
- Raw Web API over `HttpClient` is the lighter default in a Function App; the `ServiceClient` SDK is optional for typed `QueryExpression` ergonomics and supports feeding it an externally-acquired (OBO) token via its token-provider constructor — see `04`.
