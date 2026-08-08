# Persistence — Design Index

## Purpose
Catalog Azure Table Storage conventions and entity boundaries so that all Momentum business state and agent-run evidence is partitioned, concurrency-safe, and consistent across capabilities.

## Owned Responsibilities
- Azure Table Storage conventions.
- Entity boundaries (submission, backlog, catalog, comment, agent run, projection state).
- Partitioning strategy per entity.
- Concurrency model for state transitions.
- Projection state for GitHub README and outbox.

## Explicit Non-Responsibilities
- Azure Functions runtime storage (see `docs/design/cross-cutting/background-processing`).
- Queue messages (see `docs/design/cross-cutting/eventing`).
- Domain semantics (see domain and capability design).

## Requirement Baseline
- `docs/requirements/submission-governance.md`
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Azure Table Storage holds: submissions, backlog items, catalog items, comments, agent runs, projection state, and the outbox. Each entity has a deliberate partition key and uses optimistic concurrency for state transitions.

## Invariants
- Azure Table Storage is the authoritative store of Momentum business state.
- State transitions use optimistic concurrency.
- Entity boundaries are owned by application ports; agents do not write directly.
- The outbox is stored in Table Storage and emits events to the queue.
- Projection state for GitHub README is stored alongside catalog records.

## Contracts
- Ports: `ISubmissionRepository`, `IBacklogRepository`, `ICatalogRepository`, `ICommentRepository`, `IAgentRunRepository`, `IOutboxRepository`.
- Concurrency: ETag-based optimistic concurrency.
- Projection state: `catalogProjectionState` row per catalog item.

## Related Design
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/idempotency`
- `docs/design/platform/azure-storage/table-storage.md`

## Related Decisions
- `0011-azure-table-storage-holds-business-state`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
