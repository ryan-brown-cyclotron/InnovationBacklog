# Architecture Overview — Domain-Specific MCP Server

> Validated 2026-08-11 against Microsoft Learn (functions-bindings-mcp, updated 2026-06; configure-authentication-mcp, updated 2025-11) and current NuGet/API references.

**Context:** A domain-specific MCP server, hosted as a **.NET 10 isolated Azure Function App**, talking directly to **Azure DevOps (ADO)** and **Dataverse**. Not a proxy in front of Microsoft's stock MCP servers — we own the tool surface, the identity, and the backend calls.

## From proxy concept to domain server

The original concept was a managed proxy layer in front of existing MCP servers, doing three jobs:

1. **Auth bridging** — client authenticates to the proxy; proxy holds/exchanges downstream credentials.
2. **Tool trimming** — filter a large upstream tool list to a keyword allowlist (e.g. only `search`, `describe`, `read_query`).
3. **Variable substitution** — inject environment URLs, org names, prefixes so the model never supplies plumbing.

Because the data spans **both ADO and Dataverse**, proxying two separate stock servers is awkward. A domain-specific server collapses all three jobs:

| Proxy concern | In a domain-specific server |
|---|---|
| Auth bridging | We own the identity + two downstream OBO exchanges (see `01`). |
| Tool trimming | We simply don't build tools we don't want. No filter layer. |
| Variable substitution | Internal config/env vars, not request rewriting. |

## Design principles

- **Tools speak the domain vocabulary**, not raw CRUD. Expose e.g. `get_sow_analysis(sow_id)` / `list_backlog_items(status, tag)`, not generic `create_record` / `delete_table`. Each tool fans out internally to one or more ADO/Dataverse REST calls and returns exactly the shape the agent needs.
- **No upstream MCP schema drift.** We depend on the stable REST APIs, not on Microsoft's MCP tool shapes, so their renames can't break us.
- **Read-first surface.** Current capability target is read/query/search across both stores. Keep any future write tools separate and gated.
- **Never pass the inbound token downstream.** Microsoft's guidance is explicit: the MCP-server token represents access to the server only; pass-through is a security vulnerability. Downstream access goes through OBO (see `01`).

## The one real asymmetry: ADO is a two-hop query

- **Dataverse** structured read = a single OData request.
- **ADO** structured read = WIQL query (returns **IDs only**) → batch-hydrate work items by ID.

Bake the two-hop into the ADO tools so the agent sees a uniform single-call contract across both backends. See `03`.

## Cross-source partial-access reality

Every call runs under the **calling user's** identity (OBO). A user with a Dataverse role but no ADO project membership succeeds on one backend and gets `403` on the other. Decide per tool whether it:

- **degrades gracefully** (returns the half it can see, flags the rest), or
- **fails whole**.

For cross-referenced data (Innovation Backlog work items in ADO + votes/adoption in Dataverse; SOW analysis in Dataverse), graceful degradation is usually the better default — but make it a deliberate choice.

## Caching caveat

Tool results reflect the user's row-level access → **per-user**. Cache only non-user-scoped metadata (schema/`describe` output) server-wide; either skip caching user-scoped results or key strictly by user identity.

## Component sketch

```
MCP client (Copilot Studio / VS Code / Claude / etc.)
        │  streamable HTTP → /runtime/webhooks/mcp
        │  (identity via built-in MCP authorization; see 01/04)
        ▼
┌───────────────────────────────────────────────┐
│  Domain MCP Server  (.NET 10 isolated Functions │
│  + MCP extension triggers)                      │
│                                                 │
│   Tool layer  (domain vocabulary)               │
│      ├── search / describe / read_query …       │
│                                                 │
│   Auth layer  (per-user OBO, two exchanges)     │
│      ├── → token audience: Dataverse env        │
│      └── → token audience: Azure DevOps         │
│                                                 │
│   Backend clients (IHttpClientFactory)          │
│      ├── Dataverse Web API (OData + search)     │
│      └── ADO REST (WIQL + workitems)            │
└───────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
   Dataverse env             Azure DevOps org
```

Companion docs:
- `01-authentication-and-obo.md`
- `02-dataverse-api-surface.md`
- `03-azure-devops-api-surface.md`
- `04-dotnet-packages-and-project-setup.md`
