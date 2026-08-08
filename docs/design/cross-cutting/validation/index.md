# Validation — Design Index

## Purpose
Define shared validation rules for inputs, agent output, and side-effect-bound operations so that errors are detected at the appropriate boundary.

## Owned Responsibilities
- Submission input validation.
- Agent output validation (Creation Triage and Acceptance Triage results).
- Repository reference validation for solution submissions.
- Approver decision validation.
- Comment input validation.
- Projection content validation (before commit).

## Explicit Non-Responsibilities
- Authorization (see `docs/design/cross-cutting/visibility-and-authorization`).
- Persistence invariants (see `docs/design/cross-cutting/persistence`).
- Domain semantics (see domain and capability design).

## Requirement Baseline
- `docs/requirements/submission-governance.md`
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

Validation runs in application services at command boundaries. Agent output is validated before any application service persists it. Repository reference validation precedes any deep review.

## Invariants
- Validation failures do not reach domain storage.
- Agents never persist unvalidated output.
- Approver decisions are validated against submission state (only `AwaitingApproval` submissions are accept-able).
- Projection content is validated before a hub repository commit.

## Contracts
- Validation contracts accompany `CreateBacklogSubmission`, `CreateSolutionSubmission`, `UpdateSubmission`, `AcceptSubmission`, `AddComment`.
- Agent output contracts enforce field presence and type for `CreationTriageResult` and `AcceptanceTriageResult`.

## Related Design
- `docs/design/cross-cutting/agent-execution`
- `docs/design/capabilities/solution-catalog/publication.md`
- `docs/design/capabilities/solution-catalog/readme-projection.md`

## Related Decisions
- `0007-agents-return-structured-results`
- `0008-application-services-persist-agent-results`

## Deeper Documents
(This segment is intentionally index-only at this scaffold level.)
