# Solution Catalog — Catalog Entry

## Purpose
Define the `CatalogItem` record and the structured representation the deep review agent must produce to feed it.

## Concepts
- **CatalogItem** — an accepted, manageable catalog record, derived from one accepted SolutionSubmission and one read-only repository review.
- **RepositoryReference** — the submitted repository identity used for read access and citation.
- **CatalogClassification** — a structured descriptor of the solution (domain, type, intended users, capabilities, limitations).
- **CatalogRepresentation** — the deterministic input handed to the Markdown renderer.

## Fields (structured)
- NormalizedTitle
- NormalizedDescription
- Classification (CatalogClassification)
- Relationships
- Capabilities
- Limitations
- IntendedUsers
- RepositoryAssessment

## Invariants
- The catalog entry is written by the publication application service, not by the agent.
- The agent output is structured; the renderer only owns layout.
- Free-form agent text is never a field of the persisted CatalogItem.

## Contracts
- Inputs: structured agent output, validation rules in the publication service.
- Outputs: persisted `CatalogItem`.
- Ports: `ICatalogRepository`.

## Related Design
- `docs/design/capabilities/solution-catalog/repository-review.md`
- `docs/design/capabilities/solution-catalog/publication.md`
- `docs/design/cross-cutting/validation`

## Related Decisions
- `0004-catalog-readme-is-a-derived-projection`
- `0008-application-services-persist-agent-results`
