# Auditing — Design Index

## Purpose
Define shared auditing rules so that every business-significant action leaves an immutable, durable trace that supports governance and review.

## Owned Responsibilities
- Audit records for submission creation.
- Audit records for submission editing.
- Audit records for commenting.
- Audit records for agent execution (start, result, terminal status).
- Audit records for approval / rejection decisions.
- Audit records for acceptance.
- Audit records for publication.
- Audit records for GitHub projection attempts.

## Explicit Non-Responsibilities
- Domain storage layout (see `docs/design/cross-cutting/persistence`).
- Agent execution rules (see `docs/design/cross-cutting/agent-execution`).
- UI display of audit history (see frontend and capability design).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
`AuditRecord` is the transport-neutral, append-only evidence contract. Application handlers append records through `IAuditRepository` after successful state writes. Azure Table Storage persists them in the `auditRecords` table with reverse-time row keys.

Human records preserve actor, action, resource, submission correlation, audience, timestamp, and non-sensitive structured details. Agent runs record started and completed or failed events. Publication and explicitly invoked projection operations use system actors.

The HTTP API exposes recent activity and per-submission history. Submitters receive only records for their own submissions and never receive `ApproversOnly` records. Approvers and administrators can review the complete recent stream.

## Invariants
- Audit records are append-only.
- Business-significant state transitions are accompanied by an audit record.
- Agent executions leave both input and output audit traces.
- Approver decisions are preserved as immutable evidence, not rewritten.

## Contracts
- `IAuditRepository.Append` creates immutable evidence.
- `IAuditRepository.GetBySubmission` supports a resource timeline.
- `IAuditRepository.GetRecent` supports governance review.
- `IAgentRunRepository` retains full operational agent results separately from sanitized audit summaries.

## Related Design
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/persistence`
- `docs/design/capabilities/approvals`

## Related Decisions
- `0001-momentum-backend-is-authoritative`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
