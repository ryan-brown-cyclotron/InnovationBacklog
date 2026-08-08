# Momentum End-to-End Submission Lifecycle

## Purpose
Define the canonical submission lifecycle, including the orthogonal failure states, so that every capability, agent, and integration agrees on when work is intake, triage, awaiting, accepted, publication, or projection.

## Happy Path
```
Draft
  ? Created
  ? Triage Running
  ? Awaiting Approval
  ? Accepted
  ? Publication Running
  ? Published
```

Transition summary:
- **Draft** — a submitter is composing or editing a submission before creation.
- **Created** — the submission has been stored and a `SubmissionCreated` event recorded.
- **Triage Running** — the Creation Triage Agent (or Acceptance Triage Agent for backlog acceptance) is executing via `Momentum.Worker` Azure Functions.
- **Awaiting Approval** — creation triage has completed; approvers review internal comments and decide.
- **Accepted** — an approver has accepted the submission; an acceptance event is recorded.
- **Publication Running** — the Acceptance Triage Agent is producing the backlog item or catalog item and any required projection artifacts.
- **Published** — the backlog or catalog record exists in Momentum; downstream projections (GitHub README) may or may not have succeeded.

## Orthogonal Failure States
Failure states remain orthogonal to the lifecycle and do not roll back prior transitions.

- **TriageFailed** — the Creation Triage Agent could not produce an acceptable result. The submission remains `Awaiting Approval` with a flagged triage record; an operator or approver may retry or bounce.
- **PublicationFailed** — the Acceptance Triage Agent could not produce the backlog item or catalog item. The submission remains `Accepted` with a flagged publication record; retry is available without re-acceptance.
- **ProjectionFailed** — the GitHub README commit failed after creation succeeded. The catalog item remains `Published` in Momentum and a re-projection is scheduled. A projection failure must not unpublish a valid catalog item.

## Triage vs Publication Triage
- Creation triage runs automatically when a submission is created.
- Publication triage runs only after an approver accepts the submission. Creation and acceptance triage are distinct operations.

## Per-Capability Behavior
- **Backlog submission** — Creation triage produces an approver-only comment; Accept transitions to Publication triage which normalizes, rewrites, and creates the public `BacklogItem`.
- **Solution submission** — Creation triage produces submitter-visible context plus approver-only reconciliation findings; Accept transitions to a deep read-only repository review, `CatalogItem` creation, README regeneration, and the hub repository commit.

## Invariants
- Creation triage is automatic; acceptance is an explicit approver action.
- Publication is independent of GitHub projection; the catalog item is Published when Momentum state is consistent.
- GitHub projection failures do not invalidate publication.
- Agent runs are idempotent per submission; duplicate delivery must not duplicate triage, publication, or projection.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/idempotency`
- `docs/design/cross-cutting/background-processing`

## Related Decisions
- `0005-creation-triage-is-automatic`
- `0006-acceptance-triggers-publication-triage`
- `0009-azure-queue-storage-transports-events`
- `0013-azure-functions-replace-hangfire`
