# Error Handling — Design Index

## Purpose
Define the shared error-handling policy so failures are surfaced consistently across HTTP API, MCP, and Azure Functions worker surfaces, and so user-visible errors do not leak internal detail.

## Owned Responsibilities
- Error classification (user error, transient error, terminal error).
- Error surfacing through HTTP API and MCP tool responses.
- Azure Functions error model (retryable via queue visibility timeout, terminal, poison queue).
- Correlation between API errors and logged records.
- Avoidance of leaking secrets or internal structure in user-facing errors.

## Explicit Non-Responsibilities
- Resilience policy (see `docs/design/cross-cutting/resilience`).
- Idempotency policy (see `docs/design/cross-cutting/idempotency`).
- Persistence concurrency (see `docs/design/cross-cutting/persistence`).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Errors are classified at the application command boundary. The Azure Functions worker applies retry classification that aligns with the application errors. Logs correlate the user-facing error with the structured trace.

## Invariants
- Terminal errors do not silently retry.
- User-facing errors do not expose internal structure or secrets.
- Errors are correlated with the originating actor and submission identifier.

## Contracts
- HTTP error model includes stable error types suitable for clients.
- MCP tool errors report allowed failures without leaking internal storage detail.

## Related Design
- `docs/design/cross-cutting/resilience`
- `docs/design/cross-cutting/observability`
- `docs/design/cross-cutting/background-processing`

## Related Decisions
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
