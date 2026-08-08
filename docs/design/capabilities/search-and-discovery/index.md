# Search and Discovery Capability Design

## Purpose
Define how authenticated users find backlog items, catalog items, and the relationships between them, so that the business backlog and the managed solution catalog are discoverable as the canonical work surfaces.

## Owned Responsibilities
- Backlog item search (`SearchBacklog`).
- Catalog item search (`SearchCatalog`).
- Unified Momentum search across published backlog and catalog items.
- Polymorphic item resolution for callers that do not know an artifact type.
- Inferred related-item discovery with confidence and supporting reasons.
- Surfacing relationships between backlog ideas, backlog work, and catalog items.
- Search-side authorization so approver-only content is never exposed via search.
- Deterministic search-index representation aligned with capability state.

## Explicit Non-Responsibilities
- Submission, approval, comment, and publication capabilities.
- Agent execution, queue transport, and Azure Functions mechanics.
- Frontend rendering; search results are surfaced, not styled here.

## Requirement Baseline
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Search reads from Azure Table Storage projections of `BacklogItem` and `CatalogItem`. Application commands `SearchBacklog` and `SearchCatalog` enforce authorization, honor audience filtering on related comments, and surface relationships derived from capability data.

## Invariants
- Search results reflect only Momentum authoritative state.
- Search results honor audience rules; approver-only content is never returned to ordinary users.
- Search results are read-only; no command exposed in this capability creates or modifies domain state.
- Search indexes are derived from canonical records, not free-form agent text.
- Inferred related-item results are evidence and never become authoritative relationship edges implicitly.

## Contracts
- Inputs: query parameters from authenticated users.
- Outputs: search-result collections, relationship surface.
- Current application queries: `SearchBacklog`, `SearchCatalog`.
- vNext application queries: unified search, polymorphic item read, and inferred relationship discovery.
- HTTP endpoints: `GET /api/backlog`, `GET /api/catalog`, `GET /api/catalog/search`.
- Current MCP tools: `search_backlog`, `search_catalog`.
- vNext MCP tools: `search_catalyst`, `search_backlog`, `search_catalog`, `get_item`, `find_related`.

## Related Design
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/capabilities/comments`
- `docs/design/cross-cutting/search`
- `docs/design/cross-cutting/visibility-and-authorization`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
- `docs/design/capabilities/search-and-discovery/backlog-search.md`
- `docs/design/capabilities/search-and-discovery/catalog-search.md`
- `docs/design/capabilities/search-and-discovery/relationships.md`
