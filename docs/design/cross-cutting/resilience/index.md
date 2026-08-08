# Resilience — Design Index

## Purpose
Define shared resilience rules so transient failures and dependency outages degrade predictably, retries are bounded, and the worst-case outcome is well-defined.

## Owned Responsibilities
- Retry policy for transient storage and queue failures.
- Backoff and dead-letter handling for poison messages.
- Resilience boundaries for agent execution: bounded retries, terminal failures, and human handoff.
- Resilience for projection: re-projection scheduling without rolling back publication.

## Explicit Non-Responsibilities
- Concurrency model (see `docs/design/cross-cutting/persistence`).
- Idempotency rules (see `docs/design/cross-cutting/idempotency`).
- Specific platform retry configuration (see `docs/design/cross-cutting/background-processing`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Resilience is layered: storage retries are bounded; queue delivery is idempotent on stable IDs; Azure Functions applies backoff via queue visibility timeout; projection failures are isolated from publication.

## Invariants
- Agent jobs are idempotent and retries are bounded.
- Projection failures do not unpublish a valid catalog item.
- Poison messages are quarantined, not silently retrying.

## Contracts
- Retry rules are applied uniformly at ports.
- `DomainEventEnvelope` carries causation for tracing across retries.

## Related Design
- `docs/design/cross-cutting/eventing`
- `docs/design/cross-cutting/idempotency`
- `docs/design/cross-cutting/error-handling`
- `docs/design/capabilities/solution-catalog/readme-projection.md`

## Related Decisions
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
