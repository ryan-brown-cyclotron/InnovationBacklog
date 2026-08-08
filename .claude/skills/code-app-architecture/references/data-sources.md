# Data sources: registering tables, connectors, and unbound operations

Three separate registries have to agree before a call works. Most "Unable to find data
source" / "No HTTP resource was found" failures are a disagreement between them.

| Registry | File | Who writes it | Purpose |
|---|---|---|---|
| App manifest | `power.config.json` | `pac code add-data-source` | What the *published app* is allowed to reach; carries connection references |
| SDK registry | `.power/schemas/appschemas/dataSourcesInfo.ts` | generated | What `getClient()` knows how to address at runtime |
| Typed clients | `src/generated/services/*.ts` + `models/*.ts` | generated | Per-table/connector service classes |

Everything under `.power/` and `src/generated/` is generated — **never hand-edit**. Commit
it; it's build input.

---

## Adding a Dataverse table

```bash
pac code add-data-source -a dataverse -t <entity_logical_name>
```

Note it takes the **logical name** (singular, e.g. `acme_ticket`), while the manifest and
runtime address it by the **entity set name** (plural, e.g. `acme_tickets`). The manifest
records both:

```json
"databaseReferences": {
  "default.cds": {
    "dataSources": {
      "acme_tickets": { "entitySetName": "acme_tickets", "logicalName": "acme_ticket" },
      "systemusers":  { "entitySetName": "systemusers",  "logicalName": "systemuser" },
      "savedviews":   { "entitySetName": "userqueries",  "logicalName": "userquery" }
    }
  }
}
```

The manifest key is a **local alias** — it does not have to equal the entity set name (see
`savedviews` above). Whatever key you use here is the string `retrieveMultipleRecordsAsync`
and your registry must use. Aliasing is legitimate but is a common source of "works in one
app, not the other", so prefer key == entity set name unless you have a reason.

### Native tables you will probably need

Register these rather than inventing custom equivalents:

| Table | Entity set | Use |
|---|---|---|
| `systemuser` | `systemusers` | People. Never build a custom user table. |
| `team` | `teams` | Groups / assignment queues / row-level security via ownership |
| `businessunit` | `businessunits` | Resolving default owning team |
| `annotation` | `annotations` | Notes **and** file attachments |
| `task`, `appointment` | `tasks`, `appointments` | Activities regarding a record |
| `userquery` | `userqueries` | Per-user saved views (FetchXML + layout XML) |
| `environmentvariabledefinition` / `...value` | same | Runtime config — see `environment-variables.md` |

### Prefer native columns over custom ones

`statecode`/`statuscode` for lifecycle, `ownerid` for ownership + row-level security,
`createdon`/`modifiedon`/`createdby`/`modifiedby` for audit stamps. A custom `acme_state` or
`acme_isactive` column costs you: platform status transitions, out-of-the-box views, audit
semantics, and the ability to use `statecode eq 0` as a universal "active" filter.

Write this rule into the row-contracts file header, because it is the file schema scripts and
future contributors read first:

```ts
/**
 * Dataverse row contracts — SINGLE SOURCE OF TRUTH for schema shape.
 * - Native statecode/statuscode for lifecycle (not a custom state column).
 * - Native ownerid for ownership; native createdon/modifiedon for stamps.
 * - Custom `acme_*` columns ONLY for business data with no native equivalent.
 * If a column isn't here, it doesn't exist.
 */
```

---

## Adding a connector

```bash
pac code add-data-source -a "shared_office365"                 # e.g. Outlook
pac code add-data-source -a "shared_commondataserviceforapps"  # Dataverse connector
```

This adds a `connectionReferences` entry to `power.config.json` and generates a service
class. Give the connection reference a stable `xrmConnectionReferenceLogicalName` so solution
imports across environments bind rather than prompt.

**Connector calls do not throw.** They resolve `{ success, data, error }`. A failed send that
you don't check looks exactly like a success:

```ts
const result = await Office365OutlookService.SomeOperation(body);
if (!result.success) {
  throw classifyError(result.error ?? new Error("SomeOperation returned success:false"));
}
```

Wrap each connector call in the **app** (that's the only layer allowed to import the
generated service), normalize its payload there, and inject the resulting plain async
function into the bridge factory. The bridge should see
`sendMail(input: MailInput): Promise<void>` and nothing about the connector.

Two recurring connector traps worth expecting:

- The connector's own contract is usually **flat and PascalCase** and is *not* the underlying
  API's nested body. Sending the underlying API shape collides with what the codeless layer
  generates ("property X already exists"). Read the generated
  `.power/schemas/<connector>/<connector>.Schema.json` — that file is the truth.
- Date/time fields often arrive **without an offset or `Z`**. JS parses an offset-less
  date-time as *local*, silently shifting every value by the viewer's UTC offset. Normalize
  to a real instant at the connector boundary so nothing downstream has to know.

---

## Unbound functions and custom APIs: the pseudo data source

`pac code add-data-source` registers tables and connectors. It does **not** register
Dataverse Web API *functions/actions* (e.g. `RetrieveRecordChangeHistory`) or the search
endpoint. Register those yourself against a pseudo data source and call them through
`executeAsync`'s `customapi` action.

```ts
export const searchDataSourcesInfo = {
  __search__: {                        // pseudo table — no real table behind it
    tableId: "", version: "", primaryKey: "", dataSourceType: "Dataverse",
    apis: {
      searchquery: {
        path: "api/search/v1.0/query",
        method: "POST",
        parameters: [
          { name: "search",  in: "body", required: true,  type: "string" },
          { name: "entities", in: "body", required: false, type: "object" },
          { name: "top",     in: "body", required: false, type: "number" },
        ],
      },
    },
  },
} as const;

const result = await client.executeAsync<unknown, SearchResponse>({
  dataverseRequest: {
    action: "customapi",
    parameters: { operationName: "searchquery", tableName: "__search__", body },
  },
});
```

### The four rules for a GET Function

Hard-won and each one fails differently:

1. **Operation-name casing is load-bearing.** The SDK derives the request path from the
   operation name; a lowercased key produces a lowercased URI and Dataverse's OData function
   names are case-sensitive → `No HTTP resource was found`.
2. **Alias parameter values must be declared `in: "path"`.** Declaring them `in: "query"`
   emits no query string at all, leaving `...(Target=@p1)` unbound → 404. Bake the
   `?@p1={p1}&@p2={p2}` suffix into the path template.
3. **Values bind from `parameters.body`.** The runtime's parameter binder reads declared
   parameter values out of the `body` bag. Passing them flat leaves `{p1}` substituted as an
   empty string. (Passing both flat *and* in `body` is harmless belt-and-braces.)
4. **`Target` must be an Entity, not an EntityReference** — an `@odata.type` discriminator
   plus the primary key attribute. Omitting `@odata.type` fails with "The property provided
   was of type Microsoft.Xrm.Sdk.EntityReference, when the expected was
   Microsoft.Xrm.Sdk.Entity".

```ts
export const auditDataSourcesInfo = {
  __audit__: {
    tableId: "", version: "", primaryKey: "", dataSourceType: "Dataverse",
    apis: {
      RetrieveRecordChangeHistory: {                       // exact casing
        path: "api/data/v9.2/RetrieveRecordChangeHistory(Target=@p1,PagingInfo=@p2)?@p1={p1}&@p2={p2}",
        method: "GET",
        parameters: [
          { name: "p1", in: "path", required: true,  type: "string" },
          { name: "p2", in: "path", required: false, type: "string" },
        ],
      },
    },
  },
} as const;

const p1 = JSON.stringify({
  "@odata.type": `Microsoft.Dynamics.CRM.${entityLogicalName}`,
  [primaryIdAttribute]: id,
});
await client.executeAsync({
  dataverseRequest: {
    action: "customapi",
    parameters: { operationName: "RetrieveRecordChangeHistory", tableName: "__audit__",
                  body: { p1, p2 }, p1, p2 },
  },
});
```

### Pseudo sources must go in the FIRST registry

Because `getClient` is a singleton (SKILL.md §6), a pseudo source registered by a second
`getClient()` call is silently dropped. Merge them into the one registry you hand to the
first call, and gate optional ones by capability flag:

```ts
const merged = {
  ...handMaintainedTables,
  ...(pacGeneratedDataSourcesInfo ?? {}),   // connectors + real metadata
  ...searchDataSourcesInfo,
  ...(enableAuditHistory ? auditDataSourcesInfo : {}),
};
const client = getClient(
  excludeTables?.length
    ? Object.fromEntries(Object.entries(merged).filter(([k]) => !excludeTables.includes(k)))
    : merged,
);
```

Also derive service availability from the same exclusion list, so a service that this app
never registered is `undefined` rather than a client that fails on first call:

```ts
const services = {
  tickets: entityService(client, "acme_tickets", "acme_ticketid"),
  businessUnits: excludeTables?.includes("businessunits")
    ? undefined
    : entityService(client, "businessunits", "businessunitid"),
};
```

---

## The registry entry shape

```ts
{
  "<manifest alias>": {
    tableId: "",          // may be left blank; the runtime resolves it
    version: "",
    primaryKey: "acme_ticketid",   // must match the table's primary id column
    dataSourceType: "Dataverse",   // or "Connector"
    apis: {},                      // populated for connectors / pseudo sources
  }
}
```

Keeping a hand-maintained table registry in the bridge (merged *under* the generated one) is
deliberate: the generated file is regenerated per app and can drop tables, and the bridge
needs the union across all apps. `excludeTables` handles the per-app subtraction.
