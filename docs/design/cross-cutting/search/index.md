# Search — Design Index

## Purpose
Define shared search rules so that finding backlog items, catalog items, and their relationships is deterministic, audience-aware, and derived from authoritative state.

## Owned Responsibilities
- Backlog item search semantics.
- Catalog item search semantics.
- Relationship surface semantics.
- Search authorization enforcement.
- Source of truth for search results (canonical records).

## Explicit Non-Responsibilities
- Search-result rendering (see `docs/design/capabilities/search-and-discovery` and frontend design).
- Persistence layout (see `docs/design/cross-cutting/persistence`).
- Identity establishment (see `docs/design/cross-cutting/identity-and-access`).

## Requirement Baseline
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Search reads directly from canonical backlog and catalog records. Search is not a separate index that can drift; canonical records are the source.

## Invariants
- Search results reflect only published backlog and catalog items.
- Search results are read-only.
- Search respects audience rules.
- Free-form agent output is not a search field.

## Contracts
- Application commands: `SearchBacklog`, `SearchCatalog`.
- Ports: `IBacklogRepository`, `ICatalogRepository` (search APIs).

## Related Design
- `docs/design/capabilities/search-and-discovery`
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/cross-cutting/visibility-and-authorization`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
