# Backlog — Item Model

## Purpose
Define the `BacklogItem` record and its supporting types so that backlog publication and search are well-defined.

## Concepts
- **BacklogItem** — an accepted, public backlog record, including normalized title, description, capability tags, relationships, and lifecycle status.
- **BacklogItemStatus** — the current state of the item in its public lifecycle.

## Purpose
Provide the canonical shape of a backlog item and its fields.

## Invariants
- A backlog item is derived from exactly one accepted BacklogSubmission.
- A backlog item carries normalized, deterministic content; free-form agent text is not a persistent field.
- A backlog item is never modified by an agent directly; the publication application service validates and writes.

## Contracts
- Domain: `BacklogItem`, `BacklogItemStatus`.
- Application port: `IBacklogRepository`.
- Search representation: a deterministic projection persisted alongside the record.

## Related Design
- `docs/design/capabilities/backlog/publication.md`
- `docs/design/capabilities/search-and-discovery`
- `docs/design/cross-cutting/persistence`

## Related Decisions
- `0004-catalog-readme-is-a-derived-projection`
