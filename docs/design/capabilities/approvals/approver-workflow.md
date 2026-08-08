# Approvals — Approver Workflow

## Purpose
Describe the canonical approver workflow so every actor (UI, API, MCP, agent runtime) shares a single picture.

## Steps
- Approver authenticates through the business identity system.
- Approver selects a submission from the review queue and opens its composed review context.
- Approver reads the submission, latest persisted analysis, relationships, activity, and approver-only comments. Ordinary users cannot access restricted evidence, by server-side enforcement.
- Approver records an `ApprovalDecision` with accept, reject, or request changes and rationale.
- On accept, the application service persists the decision and emits `SubmissionAccepted`.
- On reject or request changes, the application service performs the corresponding deterministic transition without starting publication.
- `Momentum.Worker` translates the event into an idempotent publication triage execution.

## Roles
- Anyone with the approver role may read approver-only comments and submit decisions.
- Submitters have no decision authority over their submission.

## Invariants
- Only approvers can accept — there is no auto-accept path.
- The decision is immutable; a successor iteration is required to reverse a decision.
- Creation triage findings and acceptance rationale are preserved as audit evidence.
- `request_changes` cannot ship until the submission lifecycle defines changes, resubmission, and retriage behavior.

## Contracts
- Inputs: approver identity, decision data, submission id.
- Outputs: persisted decision, event, audit record.
- Current application commands: `AcceptSubmission`, `RejectSubmission`.
- vNext application command: a unified decision command supporting `accept`, `reject`, and `request_changes`.
- vNext MCP tools: `list_review_queue`, `get_review`, `decide_submission`.

## Related Design
- `docs/design/capabilities/approvals/acceptance.md`
- `docs/design/capabilities/approvals/internal-review.md`
- `docs/design/cross-cutting/auditing`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0006-acceptance-triggers-publication-triage`
