# Idempotency — Design Index

## Purpose
Make duplicate-aware execution an enforced property of Momentum, so retries, redundant queue deliveries, and replayed commands do not produce duplicate reviews, publications, or projections.

## Owned Responsibilities
- Duplicate-command protection.
- Duplicate queue-message protection.
- Duplicate agent job dispatch protection.
- Duplicate reviews protection (Creation and Acceptance triage idempotency).
- Duplicate publication protection (one backlog item, one catalog item per source submission).
- Duplicate GitHub projection protection (one commit per content hash change).

## Explicit Non-Responsibilities
- Persistence layout (see `docs/design/cross-cutting/persistence`).
- Queue mechanics (see `docs/design/cross-cutting/eventing`).
- Agent execution rules (see `docs/design/cross-cutting/agent-execution`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Every domain event, agent run, publication, and projection carries a stable identifier. Application services and infrastructure adapters check for prior processing before executing side effects. `Momentum.Worker` records a processed-event marker in Azure Table Storage before executing an agent job; duplicate queue deliveries short-circuit on that marker. Outbox and projection state provide reusable idempotency keys.

## Invariants
- Agent jobs are idempotent.
- Duplicate queue delivery must not duplicate reviews, publications, or projections.
- Stable IDs are assigned at the originating capability and travel through the event chain.
- Projection writes are content-hash-gated; an unchanged README does not produce a commit.

## Contracts
- Stable IDs travel via `DomainEventEnvelope`, agent-run records, and projection state.
- Idempotency keys are bounds-checked by ports and by `Momentum.Worker` before agent execution.
- Azure Table Storage stores processed-event markers keyed by event ID and operation type.
- Application services check idempotency before completing state transitions.

## Related Design
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/persistence`
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/capabilities/solution-catalog/readme-projection.md`

## Related Decisions
- `0009-azure-queue-storage-transports-events`
- `0011-azure-table-storage-holds-business-state`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
