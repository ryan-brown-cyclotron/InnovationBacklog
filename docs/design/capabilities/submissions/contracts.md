# Submissions — Contracts

## Purpose
Enumerate the application commands, ports, and events that the submissions capability exposes, so that adjacent capabilities and the agent runtime have stable integration points. Define explicit boundaries around the submissions capability.

## Contracts
The contract surface emitted by the submissions capability is enumerated below.

### Application Commands
- `CreateBacklogSubmission` — creates a backlog submission and emits `SubmissionCreated`.
- `CreateSolutionSubmission` — creates a solution submission with a repository reference and emits `SubmissionCreated`.
- `UpdateSubmission` — applies a submitter-authored update to an unaccepted submission.

### vNext Application Contracts
- `WithdrawSubmission` — performs an audited withdrawal transition when ownership and lifecycle rules permit it.
- `ListMySubmissions` — returns only submissions owned by the authenticated requester.
- Request-changes and resubmission contracts are owned jointly with the approvals workflow and must be explicit before `decide_submission` supports `request_changes`.

### Ports
- `ISubmissionRepository` — persistence port for submissions.
- `IEventPublisher` — outbox-backed port for domain events.

### Events
- `SubmissionCreated` — emitted on creation; flows through Azure Queue Storage to the creation triage job.
- `SubmissionAccepted` — emitted on approver acceptance; flows to the publication triage job.

### Inputs
- HTTP API: `POST /api/submissions/backlog`, `POST /api/submissions/solutions`, `PATCH /api/submissions/{id}`, `GET /api/submissions/{id}`.
- Current MCP tools: `create_backlog_submission`, `create_solution_submission`, `get_submission`.
- vNext MCP tools: `create_backlog_submission`, `create_solution_submission`, `get_submission`, `update_submission`, `withdraw_submission`, `list_my_submissions`.

### Outputs
- Persisted submission record.
- Domain event recorded.
- Audit record of creation or update.

## Invariants
- All commands require an authenticated business identity.
- The repository is write-gated to the submitter for update and withdrawal operations.
- The MCP server exposes only authenticated tools.
- Mutations use lifecycle checks, optimistic concurrency, and audit records.

## Related Design
- `docs/design/capabilities/submissions/lifecycle.md`
- `docs/design/cross-cutting/eventing`
- `docs/design/platform/azure-storage`
- `docs/design/platform/mcp/tool-surface.md`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0009-azure-queue-storage-transports-events`
