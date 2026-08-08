# Approvals — Acceptance

## Purpose
Define what acceptance means, what it changes in state, and what downstream chain it triggers — specifically affirming that acceptance triggers a separate agent-driven publication pass.
Codify that acceptance is the deterministic trigger for publication triage; creation and acceptance triage remain distinct.

## Action
- `AcceptSubmission` records an `ApprovalDecision` for a submission in `AwaitingApproval`.
- The submission transitions to `Accepted`.
- A `SubmissionAccepted` event is recorded in the domain log and queued in Azure Queue Storage.

## Downstream Trigger
- Acceptance triggers a separate agent-driven publication pass.
- `Momentum.Worker` schedules an idempotent publication triage execution via Azure Functions.
- The publication triage agent runs the deep-review or backlog-publication flow appropriate to the submission type.

## Invariants
- Creation triage and acceptance triage are distinct operations; the publication pass is a third, separate operation triggered only by acceptance.
- Acceptance is irreversible through the application layer; reversals require an explicit administrative action recorded as a successor iteration.
- Acceptance is the only path that emits `SubmissionAccepted`.

## Contracts
- Inputs: authenticated approver, accept decision, submission id.
- Outputs: persisted decision, persisted transition, `SubmissionAccepted` event, queue message, scheduled job, audit record.
- Current application command: `AcceptSubmission`.
- Current HTTP endpoint: `POST /api/submissions/{id}/accept`.
- Current MCP tool: `accept_submission`.
- vNext MCP mapping: `decide_submission` with `decision: accept`; acceptance remains the only decision that emits `SubmissionAccepted`.

## Related Design
- `docs/design/capabilities/approvals/approver-workflow.md`
- `docs/design/capabilities/backlog/publication.md`
- `docs/design/capabilities/solution-catalog/publication.md`
- `docs/design/cross-cutting/eventing`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0005-creation-triage-is-automatic`
- `0006-acceptance-triggers-publication-triage`
