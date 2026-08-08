# Search and Discovery — Backlog Search

## Purpose
Specify the authenticated search surface over the public business backlog.

## Purpose
Make backlog search a deterministic, audience-aware, backend-authoritative surface.

## Behavior
- `SearchBacklog` returns a paginated list of `BacklogItem` records matching the authenticated user's query.
- Results are derived from the persisted record, not from agent free-form text.
- Authenticated ordinary users see only the canonical backlog item; approver-only annotations remain gated.

## Invariants
- Search results reflect only published backlog items and their canonical fields.
- Search respects audience-based comment visibility.
- Search results are not cached in any store that could become authoritative.

## Contracts
- Inputs: query string, authentication context.
- Outputs: paginated search result including item ids and canonical fields.
- Application command: `SearchBacklog`.
- Port: `IBacklogRepository`.

## Related Design
- `docs/design/capabilities/backlog/visibility.md`
- `docs/design/capabilities/backlog/item-model.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
