# Solution Catalog Capability Design

## Purpose
Define the managed solution catalog: how accepted solution submissions become `CatalogItem` records through deep read-only repository review, and how those records are projected to the managed Momentum hub repository.

## Owned Responsibilities
- `CatalogItem`, `RepositoryReference`, and `CatalogClassification` domain model.
- Read-only deep repository review of the submitted source repository.
- `CatalogEntryFormatter` agent and deterministic Markdown rendering.
- Idempotent, content-hash-gated commit of the catalog README to the managed hub repository.
- Publication and projection separation so backlog and catalog states remain independent.

## Explicit Non-Responsibilities
- Submissions and approvals flow (see `docs/design/capabilities/submissions` and `approvals`).
- Backlog publication and search (see `docs/design/capabilities/backlog` and `search-and-discovery`).
- Agent execution, queue transport, Azure Functions mechanics (see cross-cutting and platform design).
- GitHub tooling beyond the read-only reader and the hub writer (see `docs/design/platform/github`).

## Requirement Baseline
- `docs/requirements/solution-catalog.md`
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

An accepted SolutionSubmission triggers a deep read-only review of the submitted repository. The `SolutionDeepReview` agent produces a structured representation; the application service validates and writes the `CatalogItem`. The `MarkdownCatalogRenderer` produces a deterministic README; the `HubRepositoryPublisher` commits it when its content hash changes.

## Invariants
- A submitted repository is read-only to Momentum at all times.
- The hub repository is the only repository that may receive catalog projection writes.
- The catalog is managed by Momentum; GitHub only stores the derived README.
- Publication and GitHub projection are independent: a projection failure does not unpublish a valid catalog item.
- Free-form agent text is never persisted as a catalog entry field.

## Contracts
- Inputs: `SubmissionAccepted` event, structured agent representation of the deep review.
- Outputs: persisted `CatalogItem`, deterministic README content, hub repository commit attempt.
- Ports: `ICatalogRepository`, `IRepositoryReader`, `ICatalogProjectionPublisher`.
- Application commands: `PublishCatalogItem`, `SearchCatalog`, `ProjectCatalog`.

## Related Design
- `docs/design/capabilities/submissions`
- `docs/design/capabilities/approvals`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/idempotency`
- `docs/design/platform/github`

## Related Decisions
- `0001-momentum-backend-is-authoritative`
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0004-catalog-readme-is-a-derived-projection`
- `0006-acceptance-triggers-publication-triage`

## Deeper Documents
- `docs/design/capabilities/solution-catalog/repository-review.md`
- `docs/design/capabilities/solution-catalog/catalog-entry.md`
- `docs/design/capabilities/solution-catalog/publication.md`
- `docs/design/capabilities/solution-catalog/readme-projection.md`
