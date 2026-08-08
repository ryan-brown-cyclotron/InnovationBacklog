# Approvals Capability Design

## Purpose
Define how approvers inspect review evidence, record authoritative decisions, and trigger publication triage only after deliberate acceptance.

## Owned Responsibilities
- Approver role identification.
- Internal review workflow (approver-only comments, alternative findings).
- Accept and reject decisions, including immutable decision records.
- vNext request-changes decisions and their submission lifecycle contract.
- `SubmissionAccepted` event emission on acceptance.
- Triggering asynchronous publication triage through the queue / Azure Functions mechanism.
- Audit records of approver decisions.

## Explicit Non-Responsibilities
- Submission creation and editing (see `docs/design/capabilities/submissions`).
- Comment creation and audience filtering (see `docs/design/capabilities/comments`).
- Backlog publication mechanics (see `docs/design/capabilities/backlog`).
- Solution catalog publication and projection mechanics (see `docs/design/capabilities/solution-catalog`).
- Agent execution, queue transport, and Azure Functions mechanics (see cross-cutting and platform design).

## Requirement Baseline
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Approvers authenticate through the business identity system and access internal review content. Their decision is recorded as an `ApprovalDecision`. On acceptance, the application service emits `SubmissionAccepted`, which `Momentum.Worker` consumes and routes to the agent runtime for an idempotent publication triage execution.

## Invariants
- Approval is the only path that transitions a submission from `AwaitingApproval` to `Accepted`.
- Acceptance triggers a separate agent-driven publication pass; creation and acceptance triage are distinct operations.
- Every reviewer decision is recorded as immutable evidence.
- Approver-only comments must never be exposed to ordinary users, even in approval flows.
- No agent may decide on a submission on a user's behalf.

## Contracts
- Inputs: authenticated approver identity, decision and rationale, submission identifier.
- Outputs: persisted `ApprovalDecision`, audit record, and `SubmissionAccepted` only for acceptance.
- Current application commands: `AcceptSubmission`, `RejectSubmission`.
- Ports: `ISubmissionRepository`, `IEventPublisher`.
- Current HTTP endpoints include accept and reject submission decisions.
- Current MCP tools: `accept_submission`, `reject_submission`, exposed only to approvers or administrators.
- vNext MCP tools: `list_review_queue`, `get_review`, `decide_submission`. The unified decision tool replaces both current mutation tools when vNext ships.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/comments`
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/eventing`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0005-creation-triage-is-automatic`
- `0006-acceptance-triggers-publication-triage`

## Deeper Documents
- `docs/design/capabilities/approvals/approver-workflow.md`
- `docs/design/capabilities/approvals/internal-review.md`
- `docs/design/capabilities/approvals/acceptance.md`
