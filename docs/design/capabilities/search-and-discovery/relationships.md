# Search and Discovery — Relationships

## Purpose
Describe how relationships between backlog ideas, backlog items, and catalog items are surfaced to authenticated users, so users can navigate from a business need to related work and to reusable solutions.
Lock in the deterministic relationship surface so search and discovery stay coherent across capabilities.

## Persisted Relationships
- A backlog item may originate from a single accepted backlog submission (origin relationship).
- A catalog item may originate from a single accepted solution submission (origin relationship).
- A backlog item may relate to a catalog item (e.g., the work proposes to adopt or integrate a managed solution).
- An accepted backlog submission may reference a proposed catalog item.

## Inferred Relationships
`find_related` may infer candidates from an existing item or free text. Each candidate includes a relationship type, confidence, and reason so a caller can evaluate the evidence. Inferred results are not persisted edges and do not alter authoritative records.

## Invariants
- Relationships are derived from accepted state, not from drafts.
- Relationship edges are read-only; no command in this capability creates them.
- Relationship surface honors the same audience rules as the underlying records.
- Inferred candidates are clearly distinguished from persisted relationships.
- No confidence threshold silently promotes an inferred candidate into a persisted edge.

## Contracts
- Persisted inputs: a backlog item ID or catalog item ID.
- Inferred inputs: an item ID or free text, with optional relationship-type and result-type filters.
- Outputs: persisted edges or inferred related-item summaries with relationship type, confidence, and reason.
- vNext MCP tool: `find_related`.
- Relationship query and ranking support must exist before `find_related` is implemented. No relationship mutation port or tool is introduced.

## Related Design
- `docs/design/capabilities/backlog/item-model.md`
- `docs/design/capabilities/solution-catalog/catalog-entry.md`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- (latent; protected by `0001-momentum-backend-is-authoritative`)
