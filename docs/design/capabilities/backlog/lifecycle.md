# Backlog — Lifecycle

## Purpose
Specify the public lifecycle a `BacklogItem` passes through after publication so that the backlog remains consistent with delivery and acceptance.

## Purpose
Make backlog lifecycle states contractually stable.

## States (placeholder pending requirement acceptance)
- **Published** — the record is in Momentum and visible to authenticated users.
- **Retired** — the record is removed from public visibility while remaining in audit history. (Pending requirement acceptance.)
- **Superseded** — the record remains visible but is marked as replaced by a successor. (Pending requirement acceptance.)

## Transitions
- A BacklogSubmission transitions to acceptance ? publication triage ? `BacklogItem` Published on success.
- Retirements and supersessions require explicit administrative operations not exposed at the capability layer (pending requirement acceptance).

## Invariants
- `BacklogItem` is published exclusively by the publication application service.
- Duplicate publication must not produce multiple backlog items for the same source submission.
- Search and discovery respect the visibility model.

## Contracts
- Inputs: `SubmissionAccepted` event, structured agent result, administrative action for retirement or supersession (pending).
- Outputs: persisted `BacklogItem`, audit record, search-indexed entry.
- Port: `IBacklogRepository`.

## Related Design
- `docs/design/capabilities/backlog/publication.md`
- `docs/design/capabilities/search-and-discovery`
- `docs/design/cross-cutting/auditing`

## Related Decisions
- `0006-acceptance-triggers-publication-triage`
