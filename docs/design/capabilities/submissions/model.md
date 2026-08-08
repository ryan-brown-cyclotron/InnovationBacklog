# Submissions — Domain Model

## Purpose
Specify the submissions domain model so that the capability is well-defined across domain, application, runtime, and infrastructure layers.

## Concepts
- **Submission** — the base record shared by all submissions with status, ownership, and timing fields.
- **BacklogSubmission** — a submission that proposes backlog work. Creation triage produces an approver-only comment.
- **SolutionSubmission** — a submission that proposes a catalog item and references an external repository. Creation triage produces submitter-visible context plus approver-only reconciliation findings.
- **SubmissionStatus** — the lifecycle state of a submission (see `lifecycle.md`).
- **SubmissionCreated** — a domain event recorded when the submission is first persisted and queued for triage.
- **SubmissionAccepted** — a domain event recorded when an approver accepts a submission that is awaiting approval.

## Purpose
Capture the domain semantics so application services and agents agree on what a submission represents.

## Invariants
- Every submission is owned by exactly one submitter (authenticated business user).
- The submitter is the only authorized editor while the submission is not yet accepted.
- A solution submission carries an external repository reference that is read-only to Momentum.
- A submission carries distinct fields for submitter-visible content and approver-only comment content; agents must never mix the two.

## Contracts
- Domain: `Submission`, `BacklogSubmission`, `SolutionSubmission`, `SubmissionStatus`, `SubmissionCreated`, `SubmissionAccepted`.
- Application ports: `ISubmissionRepository` exposing create, read, and update by submitter.
- Storage: submissions are partitioned for predictable access by submitter and submission id.

## Related Design
- `docs/design/capabilities/submissions/lifecycle.md`
- `docs/design/capabilities/submissions/contracts.md`
- `docs/design/cross-cutting/persistence`

## Related Decisions
- `0007-agents-return-structured-results`
