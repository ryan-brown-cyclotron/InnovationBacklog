# Momentum System Boundaries

## Purpose
Make every trust and integration boundary explicit so that no component or agent may cross one by accident. Boundaries are the shared language for ownership, authority, and integration safety.

## Scope
Listed boundaries must be respected by every capability, cross-cutting, and platform design. This document does not describe implementation choices — only the boundaries those implementations must enforce.

## Boundary 1 — User Identity
- All Momentum actions are gated by an authenticated business identity.
- Authorization checks are enforced by application services on the backend.
- Frontend visibility is presentational only and is never the authoritative check.

## Boundary 2 — Submission to Triage
- A submitter-visible context, plus, for solution submissions, an approver-only reconciliation layer.
- Approver-only comments must never reach an authenticated ordinary user.

## Boundary 3 — Momentum Library Family
- `Momentum.Library.Domain` owns business concepts and invariants; no infrastructure dependency is permitted in it.
- `Momentum.Library.Application` owns use cases and ports; it determines "what is allowed."
- `Momentum.Library.Runtime` owns agent, MCP, event, and job runtime behavior.
- `Momentum.Library.Infrastructure` owns external adapters.
- Cross-layer communication uses declared contracts only.

## Boundary 4 — Agent Authority
- Agents analyze, classify, research, reconcile, and format.
- Agents never persist domain state directly.
- Application services validate and persist agent results; agent output is evidence.
- Agent identities must not be granted write capability for submitted repositories.

## Boundary 5 — Queue and Job Separation
- Azure Queue Storage transports asynchronous application events.
- `Momentum.Worker` (Azure Functions) consumes queue events and executes agent runtime work.
- Azure Functions provides polling, visibility timeout, retries, and a poison queue for failed messages.
- Agent jobs are idempotent; duplicate queue delivery must not duplicate reviews, publications, or projections.

## Boundary 6 — Persistence Roles
- Azure Table Storage stores Momentum business state, agent-run records, and idempotency markers.
- Azure Functions runtime storage uses the same Aspire-composed Azure Storage account; it is not a separate business store.

## Boundary 7 — Publication and Projection Separation
- Publication and GitHub projection are separate outcomes.
- A GitHub projection failure must not unpublish a valid Momentum catalog item.
- A catalog item can be Published in Momentum while its README projection temporarily fails.

## Boundary 8 — Repository Safety
- Submitted repositories are always read-only to Momentum and agents.
- Only the managed Momentum hub repository may receive catalog projection writes.
- Read and write GitHub capabilities must use separate contracts and credentials.

## Invariants
- No boundary may be crossed silently by a new dependency or implementation shortcut.
- A boundary change requires an explicit architectural decision and design change.
- Boundary violations discovered in delivery flow into `docs/decisions/` and `docs/delivery/lineage.md`.

## Related Design
- `docs/design/system/authority-model.md`
- `docs/design/system/component-model.md`
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/idempotency`
- `docs/design/platform/github`
- `docs/design/platform/azure-storage`
- `src/Momentum.Worker/AGENTS.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0003-submitted-repositories-are-read-only`
- `0009-azure-queue-storage-transports-events`
- `0011-azure-table-storage-holds-business-state`
- `0013-azure-functions-replace-hangfire`
