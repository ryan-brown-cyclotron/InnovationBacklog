# Background Processing — Design Index

## Purpose
Define how durable agent job execution is owned by `Momentum.Worker` (Azure Functions) in cooperation with Azure Queue Storage, so that retries, concurrency, and operational visibility are coherent across capabilities.

## Owned Responsibilities
- Queue-triggered Azure Functions for domain events.
- Function ownership and routing by event type.
- Retry rules and backoff via the Azure Functions runtime and queue visibility timeout.
- Concurrency limits and cancellation through the Functions host.
- Operational visibility via Functions host logs and Application Insights.

## Explicit Non-Responsibilities
- Queue transport mechanics (see `docs/design/cross-cutting/eventing`).
- Persistence layout for business state (see `docs/design/cross-cutting/persistence`).
- Agent execution boundaries (see `docs/design/cross-cutting/agent-execution`).
- Azure Storage job store selection (see `docs/design/platform/azure-storage`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.Worker` runs as Azure Functions triggered by Azure Queue Storage messages. It delegates to `Momentum.Library.Runtime` for agent execution. Runtime returns structured evidence; Application services validate and persist. The Functions runtime provides retries, poison queues, and concurrency.

## Invariants
- `Momentum.Worker` executes agent jobs; it does not own event transport.
- Agent jobs are idempotent.
- Function retries are bounded and recorded.
- Cancellation is honored within the agent executing the function.
- Functions host logs are operationally visible and intentionally not the source of truth for business state.

## Contracts
- In: queue messages with stable event IDs.
- Out: structured execution evidence (success, retryable failure, terminal failure).
- Port: `IAgentTriageRuntime`.

## Related Design
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/idempotency`
- `docs/design/cross-cutting/observability`
- `docs/design/platform/azure-storage`
- `src/Momentum.Worker/AGENTS.md`

## Related Decisions
- `0009-azure-queue-storage-transports-events`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
