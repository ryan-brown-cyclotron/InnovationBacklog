# Submissions Capability Design

## Purpose
Define the submission capability: how authenticated users create backlog or solution submissions, edit them before acceptance, and route them into creation triage. Submissions are the system of record entry point for both successful and rejected items in the Momentum backlog and catalog pipeline.

## Owned Responsibilities
- Submission domain model, including `Submission`, `BacklogSubmission`, `SolutionSubmission`, `SubmissionStatus`, and event types.
- Creation, editing, and read of submissions during the submitter-visible window.
- Triggering the automatic creation triage pipeline.
- Submission lifecycle states from Draft through AwaitingApproval.
- Application-level authorization on who may edit a submission.

## Explicit Non-Responsibilities
- Approval and acceptance rules (see `docs/design/capabilities/approvals`).
- Publication into backlog items (see `docs/design/capabilities/backlog`).
- Publication into catalog items and projection (see `docs/design/capabilities/solution-catalog`).
- Comment authority and audience filtering (see `docs/design/capabilities/comments`).
- Backlog and catalog search (see `docs/design/capabilities/search-and-discovery`).
- Agent execution details, queue transport, Azure Functions handling (see cross-cutting and platform design).

## Requirement Baseline
- `docs/requirements/business-backlog.md`
- `docs/requirements/solution-catalog.md`
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

A submission is stored in Azure Table Storage through `TableSubmissionRepository`. Creation publishes a `SubmissionCreated` domain event that an event envelope transports through Azure Queue Storage. `Momentum.Worker` consumes the queue message and dispatches the Creation Triage Agent. While the agent runs, the submission is in `TriageRunning`. When the agent result is validated and persisted by an application service, the submission transitions to `AwaitingApproval`.

## Invariants
- Every user is authenticated through the business identity system.
- Any authenticated user may create a submission.
- A submission may be edited only by its submitter and only before acceptance.
- Creation triage runs automatically when a submission is created.
- An agent never writes submission records directly; the application service validates and persists the agent result.
- Agents never store approver-only comment content in a submitter-visible submission body or field.

## Contracts
- Inputs: authenticated user input (title, description, optional repository reference for solutions).
- Outputs: `SubmissionCreated` domain event, `SubmissionCreated` queue envelope, and persisted submission state.
- Ports: `ISubmissionRepository`, `IEventPublisher`.
- Application commands: `CreateBacklogSubmission`, `CreateSolutionSubmission`, `UpdateSubmission`.
- Events emitted: `SubmissionCreated`.
- State transitions: Draft ? Created ? TriageRunning ? AwaitingApproval.

## Related Design
- `docs/design/capabilities/backlog`
- `docs/design/capabilities/solution-catalog`
- `docs/design/capabilities/approvals`
- `docs/design/capabilities/comments`
- `docs/design/cross-cutting/identity-and-access`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/eventing`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0005-creation-triage-is-automatic`
- `0007-agents-return-structured-results`
- `0008-application-services-persist-agent-results`

## Deeper Documents
- `docs/design/capabilities/submissions/model.md`
- `docs/design/capabilities/submissions/lifecycle.md`
- `docs/design/capabilities/submissions/permissions.md`
- `docs/design/capabilities/submissions/contracts.md`
