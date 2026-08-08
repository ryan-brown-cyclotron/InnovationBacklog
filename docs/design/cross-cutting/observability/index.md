# Observability — Design Index

## Purpose
Define shared observability concerns — tracing, metrics, structured logs, and health checks — that operate across capabilities so behavior is explainable and incidents are diagnosable.

## Owned Responsibilities
- Distributed tracing across the AppHost resource graph.
- Metrics for queue depth, Azure Functions executions, agent execution times, projection results.
- Structured logs correlating application, agent, and job events.
- Health endpoints exposing storage, queue, Azure Functions, and Foundry reachability.

## Explicit Non-Responsibilities
- Error-handling policy details (see `docs/design/cross-cutting/error-handling`).
- Resilience policy details (see `docs/design/cross-cutting/resilience`).
- Platform composition (see `docs/design/platform/aspire`).
- Runtime telemetry configuration (see `docs/design/platform/aspire`).

## Requirement Baseline
- (supporting; no standalone requirement baseline.)

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

OpenTelemetry is composed by the Aspire AppHost and applied across `Momentum.Service`, `Momentum.Worker`, queues, and Foundry. Correlation identifiers flow from event envelopes into agent runs and projections.

## Invariants
- Cross-cutting traces carry correlation identifiers across processes.
- Health endpoints are exposed for every operational dependency.
- Structured logs are emitted for every state transition and agent execution.

## Contracts
- OpenTelemetry exporters configured at the Aspire level.
- `/health` endpoint exposes dependency health.

## Related Design
- `docs/design/cross-cutting/resilience`
- `docs/design/cross-cutting/error-handling`
- `docs/design/platform/aspire/composition.md`

## Related Decisions
- `0012-aspire-apphost-is-the-composition-root`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
