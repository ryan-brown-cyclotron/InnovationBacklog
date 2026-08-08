# Solution Catalog — Publication

## Purpose
Specify how a deep review becomes a published `CatalogItem`, separating Momentum-side publication from GitHub-side projection so that backlog and catalog states remain independent.

## Purpose
Make publication and projection distinct, contractually well-defined outcomes.

## Flow
- Approver accepts a solution submission ? `SubmissionAccepted` emitted.
- `Momentum.Worker` schedules the publication triage execution.
- `AcceptanceTriageAgent` runs `SolutionDeepReview` against the read-only repository.
- `PublishCatalogItem` validates the structured result and writes the `CatalogItem`.
- `ProjectCatalog` is dispatched independently from publication.

## Invariants
- Publication occurs entirely in Momentum (Azure Table Storage).
- The projection publisher (`ICatalogProjectionPublisher`) operates only on the managed hub repository.
- A GitHub projection failure must not unpublish a valid catalog item.
- The agent's free-form text is never persisted on the catalog item.

## Contracts
- Inputs: `SubmissionAccepted` event, structured agent result, content hash strategy for projection.
- Outputs: persisted `CatalogItem`, projection attempt, audit records.
- Application commands: `PublishCatalogItem`, `ProjectCatalog`, `SearchCatalog`.
- Ports: `ICatalogRepository`, `IRepositoryReader`, `ICatalogProjectionPublisher`.

## Related Design
- `docs/design/capabilities/solution-catalog/catalog-entry.md`
- `docs/design/capabilities/solution-catalog/readme-projection.md`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/cross-cutting/idempotency`

## Related Decisions
- `0002-github-synchronization-is-one-way`
- `0004-catalog-readme-is-a-derived-projection`
