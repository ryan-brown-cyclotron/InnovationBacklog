# Backlog Capability Design

## Purpose
Define the public business backlog: how accepted backlog submissions become `BacklogItem` records, how those records are exposed, and how they relate to public search and discovery.

## Owned Responsibilities
- `BacklogItem` domain model and `BacklogItemStatus`.
- Publication of accepted backlog submissions into `BacklogItem` records.
- Visibility model for public business backlog items.
- Search and retrieval of backlog items for authenticated users.
- Lifecycle of backlog items as projected by Momentum.

## Explicit Non-Responsibilities
- Submissions and approvals flow (see `docs/design/capabilities/submissions` and `approvals`).
- Solution catalog and projection to GitHub (see `docs/design/capabilities/solution-catalog`).
- Comments on submissions or items (see `docs/design/capabilities/comments`).
- Agent execution and queue transport (see cross-cutting and platform design).

## Requirement Baseline
- `docs/requirements/business-backlog.md`
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

On acceptance, a `SubmissionAccepted` event triggers publication triage. The backlog publication flow normalizes and rewrites the submission content, then creates a public `BacklogItem` through the `PublishBacklogItem` application command. The BacklogPublicationFormatter agent produces the structured representation; deterministic application code persists it. The `IBacklogRepository` writes the record to Azure Table Storage.

## Invariants
- Backlog items become public only after acceptance and successful publication triage.
- The business backlog is managed and rendered by Momentum; no external system is its source of truth.
- Backlog items are read-accessible to authenticated users.
- A backlog item is not a solution. Submission type controls routing into backlog vs solution-catalog publication.

## Contracts
- Inputs: `SubmissionAccepted` event for a backlog submission, plus structured agent representation.
- Outputs: persisted `BacklogItem`, search-indexed representation, audit record.
- Ports: `IBacklogRepository`.
- Application commands: `PublishBacklogItem`, `SearchBacklog`.
- Events: none emitted (publication is catalysed, not dual-emitted).

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/search-and-discovery`
- `docs/design/cross-cutting/persistence`
- `docs/design/cross-cutting/search`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0006-acceptance-triggers-publication-triage`

## Deeper Documents
- `docs/design/capabilities/backlog/item-model.md`
- `docs/design/capabilities/backlog/publication.md`
- `docs/design/capabilities/backlog/visibility.md`
- `docs/design/capabilities/backlog/lifecycle.md`
