# Azure Storage — Table Storage

## Purpose
Document the Azure Table Storage conventions used for Momentum business state so entity boundaries, partitioning, and concurrency are consistent across capabilities.

## Purpose
State the conventions for entity boundaries, partitioning, and concurrency.

## Entities Owned
- `submissions` table — backlog and solution submissions and their status history.
- `backlogItems` table — published backlog items.
- `catalogItems` table — published catalog items.
- `comments` table — submission comments indexed by audience.
- `agentRuns` table — agent execution evidence.
- `outbox` table — at-least-once event publication backing store.
- `projectionState` table — per-catalog-item GitHub README projection status and last content hash.

## Partitioning
- Submissions are partitioned by submitter.
- Backlog items and catalog items are partitioned by item id.
- Comments are partitioned by submission id; audience is a property.
- Agent runs are partitioned by submission id; the run id is the row key.
- Outbox and projection state are partitioned by originating id.

## Concurrency
- Optimistic concurrency via ETag on every state transition.
- State transitions validate ETag before writing.

## Invariants
- The table layout is owned by application ports; agents do not write tables directly.
- Partitioning does not leak across capabilities; cross-capability queries go through ports.
- Outbox emission is at-least-once and idempotent on event id.

## Contracts
- Outputs: deterministic table entities with stable ids.
- Concurrency: optimistic through ETag.

## Related Design
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/idempotency`
- `docs/design/capabilities/solution-catalog/readme-projection.md`

## Related Decisions
- `0011-azure-table-storage-holds-business-state`
