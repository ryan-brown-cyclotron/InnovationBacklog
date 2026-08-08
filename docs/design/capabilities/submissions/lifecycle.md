# Submissions — Lifecycle

## Purpose
Define the submission lifecycle states, transitions, and authorization windows so that every layer applies the same rules.

## States
- **Draft** — composed but not yet persisted.
- **Created** — persisted; a `SubmissionCreated` event is recorded and queued.
- **TriageRunning** — the Creation Triage Agent is producing results for this submission.
- **AwaitingApproval** — creation triage has completed; approvers review findings and decide.
- **ChangesRequested** (vNext) — a reviewer has requested submitter changes; publication cannot begin until the submission is updated and resubmitted.
- **Withdrawn** (vNext) — the owning submitter has ended the contribution before an authoritative terminal decision or publication transition.
- **Accepted** — an approver has accepted the submission; `SubmissionAccepted` is emitted.
- **TriageFailed** (orthogonal) — creation triage did not produce an acceptable result; the submission remains AwaitingApproval with a flagged record.
- **PublicationFailed** (orthogonal) — applies only after acceptance; backlog/catalog formation did not succeed.
- **ProjectionFailed** (orthogonal) — applies only after publication; GitHub README commit failed.

## Transitions
- Draft ? Created on first persisted write.
- Created ? TriageRunning when `Momentum.Worker` schedules the idempotent Azure Functions execution.
- TriageRunning ? AwaitingApproval on successful Creation Triage Agent result validation and persistence.
- TriageRunning ? TriageFailed (orthogonal) on agent failure; the faithful state remains AwaitingApproval with a triage failure flag.
- AwaitingApproval ? ChangesRequested on an approver decision with rationale.
- ChangesRequested ? AwaitingApproval when the owning submitter updates and resubmits the contribution; retriage requirements must be deterministic.
- A non-terminal pre-publication state ? Withdrawn when the owning submitter withdraws and the state policy permits it.
- AwaitingApproval ? Accepted on approver decision.
- Accepted ? PublicationRunning (in the publication capability).
- AwaitingApproval is the last editable state for the submitter; once Accepted, the submitter must open a successor iteration to propose material changes.

## Invariants
- Submission is editable only by its submitter and only in explicitly editable states, including `ChangesRequested` once implemented.
- Approver-only comments produced during triage must never appear in submitter-visible views.
- Creation triage and acceptance triage are distinct operations with distinct event types.
- Duplicate triage job dispatch must not duplicate triage state.
- Withdrawal and request-changes are audited domain transitions, not status fields patched directly by clients.
- Withdrawn submissions cannot be accepted or published.

## Contracts
- Inputs: create/edit commands authorized to the submitter.
- Outputs: state transition, domain event emitted, audit record.
- Current events: `SubmissionCreated`, `SubmissionAccepted`.
- vNext transitions require explicit withdrawal, changes-requested, and resubmission contracts before their MCP tools or decision values ship.
- Ports: `ISubmissionRepository`, `IEventPublisher`, `IAgentTriageRuntime`.

## Related Design
- `docs/design/capabilities/submissions/model.md`
- `docs/design/capabilities/approvals`
- `docs/design/system/end-to-end-lifecycle.md`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0005-creation-triage-is-automatic`
- `0006-acceptance-triggers-publication-triage`
