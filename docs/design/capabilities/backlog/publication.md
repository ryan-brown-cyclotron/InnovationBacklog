# Backlog — Publication

## Purpose
Define how an accepted backlog submission becomes a public `BacklogItem` so that the business backlog is deterministic, traceable, and free of agent free-form drift.

## Purpose
Lock in the application-driven publication flow and its dependencies on the agent formatter.

## Flow
- Approver accepts a BacklogSubmission ? `SubmissionAccepted` emitted.
- `Momentum.Worker` schedules the publication triage execution.
- `BacklogPublicationFormatter` agent returns the structured representation (title, description, capabilities, relationships).
- The application service `PublishBacklogItem` validates and persists the record.

## Invariants
- Publication is catalysed only after an approver acceptance.
- The application service is the only writer of `BacklogItem`.
- Duplicate queue delivery must not duplicate the backlog item.
- Free-form agent text is not stored as a backlog item field; only normalized structured content persists.

## Contracts
- Inputs: `SubmissionAccepted` event, structured agent result.
- Outputs: persisted `BacklogItem`, audit record, search-indexed entry.
- Application command: `PublishBacklogItem`.
- Port: `IBacklogRepository`.

## Related Design
- `docs/design/capabilities/backlog/item-model.md`
- `docs/design/capabilities/approvals`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/idempotency`

## Related Decisions
- `0006-acceptance-triggers-publication-triage`
- `0008-application-services-persist-agent-results`
