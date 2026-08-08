# Eventing — Design Index

## Purpose
Define the boundaries of Momentum's asynchronous event flow so that domain events, queue messages, retries, and poison handling form a coherent contract across capabilities.

## Owned Responsibilities
- Domain and application events (e.g., `SubmissionCreated`, `SubmissionAccepted`).
- Azure Queue Storage messages and envelopes.
- Correlation and causation identifiers across event chain.
- Delivery assumptions (at-least-once, redundancy handled by idempotency).
- Poison-message handling and quarantine strategy.

## Explicit Non-Responsibilities
- Durable agent job execution, retries, and scheduling (see `docs/design/cross-cutting/background-processing`).
- Catalog table layouts (see `docs/design/cross-cutting/persistence`).
- MCP transport or delivery (see `docs/design/platform/mcp`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Domain events are recorded by application services and queued via Azure Queue Storage envelopes. `Momentum.Worker` consumes each envelope and invokes the agent runtime, recording idempotency markers in Azure Table Storage. Correlation and causation travel with the envelope.

## Invariants
- Azure Queue Storage transports asynchronous application events.
- Every event and agent run receives a stable ID; duplicate delivery must not duplicate behavior.
- Agent jobs are idempotent.
- Queue messages carry correlation and causation identifiers.
- Poison messages are quarantined, not silently retried forever.

## Contracts
- Envelope: `DomainEventEnvelope` carrying event type, ids, correlation, causation.
- Ports: `IEventPublisher`, queue consumer (`Momentum.Worker`).
- Outbox: TableStorage-backed outbox for at-least-once event delivery.

## Related Design
- `docs/design/cross-cutting/idempotency`
- `docs/design/cross-cutting/background-processing`
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/platform/azure-storage/queue-storage.md`
- `src/Momentum.Worker/AGENTS.md`

## Related Decisions
- `0009-azure-queue-storage-transports-events`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
