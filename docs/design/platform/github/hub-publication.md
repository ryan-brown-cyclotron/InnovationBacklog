# GitHub — Hub Publication

## Purpose
Define how the catalog README is committed to the managed Momentum hub repository as a one-way, idempotent, content-hash-gated projection.

## Purpose
Make hub publication the only Momentum write target on GitHub, with deterministic and idempotent behavior.

## Publisher Contract
- `HubRepositoryPublisher` commits the catalog README only to the managed hub repository.
- A commit occurs only when the rendered README's content hash differs from the last committed hash.
- The publisher does not modify any other repository or any other file in the hub repository besides the catalog README.

## Invariants
- The hub repository is the **only** GitHub write target for Momentum.
- A `ProjectionFailed` event does not roll back `Published` catalog items.
- Synchronization is one-way; GitHub state is never consulted to derive business state.

## Contracts
- In: `CatalogItem`, target file path, last content hash.
- Out: commit attempt outcome (success, retry-scheduled, failed), audit record, projection state update.

## Related Design
- `docs/design/capabilities/solution-catalog/readme-projection.md`
- `docs/design/platform/github/credential-separation.md`

## Related Decisions
- `0002-github-synchronization-is-one-way`
- `0004-catalog-readme-is-a-derived-projection`
