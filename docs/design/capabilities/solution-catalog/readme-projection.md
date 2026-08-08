# Solution Catalog — README Projection

## Purpose
Define the deterministic, read-only-bounded, write-only-hub-bounded projection of the managed catalog to the Momentum hub repository, so that the GitHub README remains a safe, predictable, and idempotent derivative.

## Purpose
Codify the boundary between the read-only submitted repository and the writable managed hub repository so that no agent or component violates either.

## Repository Boundary
- The submitted repository is **read-only**. Momentum and its agents never write to it. The repository reader uses a credential and contract that has only read scope.
- The managed Momentum hub repository is the **only** repository that may receive catalog projection writes. The hub publisher uses a separate credential and contract that is permitted only to write the catalog README.
- Read and write GitHub capabilities must use separate contracts and credentials. A single broad GitHub credential for Momentum must never be created.

## Renderer Responsibility
- `MarkdownCatalogRenderer` produces a deterministic README.
- Renderer output is fully derived from the `CatalogItem` representation and layout rules.
- Free-form agent text is not a renderer input.

## Publisher Responsibility
- `HubRepositoryPublisher` commits the README.
- The commit only proceeds when the rendered README's content hash differs from the previously committed hash.
- A projection failure is logged and tracked without rolling back the catalog publication.

## Invariants
- The submitted repository is never written to by any Momentum component or agent.
- The hub repository is the only target for projection commits.
- A projection failure does not unpublish a valid catalog item.
- Projection is idempotent on content hash and on submission-of-record identity.
- The agent does not author the README; the renderer does, deterministically.

## Contracts
- Inputs: `CatalogItem`, repository reference, content hash of last published README.
- Outputs: managed hub repository commit attempt, audit record, projection status (success, retry-scheduled, failed).
- Ports: `ICatalogProjectionPublisher`.

## Related Design
- `docs/design/capabilities/solution-catalog/publication.md`
- `docs/design/platform/github/repository-reading.md`
- `docs/design/platform/github/hub-publication.md`
- `docs/design/platform/github/credential-separation.md`

## Related Decisions
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0004-catalog-readme-is-a-derived-projection`
