# Azure Storage — Platform Index

## Purpose
Define how Momentum uses Azure Table Storage for business state and idempotency markers and Azure Queue Storage for asynchronous event transport, with clear separation between the two storage responsibilities.

## Owned Responsibilities
- Azure Table Storage conventions for Momentum business state.
- Azure Queue Storage conventions for application events.
- Cataloguing which entities live in tables and what is a queue message.
- Local development substitution with Azurite.

## Explicit Non-Responsibilities
- Azure Functions runtime storage (see `docs/design/cross-cutting/background-processing`).
- Foundry storage (see `docs/design/platform/azure-foundry`).
- Hub repository storage (see `docs/design/platform/github`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.Library.Infrastructure` provides Azure Storage adapters: `TableSubmissionRepository`, `TableBacklogRepository`, `TableCatalogRepository`, `TableCommentRepository`, `TableAgentRunRepository`, `TableOutboxRepository`, and `AzureQueueEventPublisher`. Azurite stands in for development; production uses Azure Storage accounts referenced through Aspire.

## Invariants
- Azure Table Storage holds Momentum business state, agent-run records, and idempotency markers for `Momentum.Worker`.
- Azure Queue Storage transports asynchronous application events.
- Momentum is the system of record over this storage.

## Contracts
- Storage adapters implement application ports.
- Concurrency is enforced at the table entity boundary.

## Related Design
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/eventing`
- `docs/design/platform/aspire/composition.md`

## Related Decisions
- `0009-azure-queue-storage-transports-events`
- `0011-azure-table-storage-holds-business-state`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
- `docs/design/platform/azure-storage/table-storage.md`
- `docs/design/platform/azure-storage/queue-storage.md`
