# Search and Discovery — Catalog Search

## Purpose
Specify the authenticated search surface over the managed solution catalog.

## Purpose
Make catalog search a deterministic, audience-aware, backend-authoritative surface.

## Behavior
- `SearchCatalog` returns a paginated list of `CatalogItem` records matching the authenticated user's query.
- Results include normalized title, description, classification, capabilities, and the repository reference.
- Free-form agent output is not a search-result field; only deterministic structured fields are returned.

## Invariants
- Search results reflect only published catalog items.
- Search respects audience rules across all comment surfaces.
- A `ProjectionFailed` state does not hide a published catalog item from search; publication and projection remain separate.

## Contracts
- Inputs: query string, authentication context.
- Outputs: paginated search result including catalog item ids and structured fields.
- Application command: `SearchCatalog`.
- Port: `ICatalogRepository`.

## Related Design
- `docs/design/capabilities/solution-catalog/catalog-entry.md`
- `docs/design/capabilities/solution-catalog/readme-projection.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0004-catalog-readme-is-a-derived-projection`
