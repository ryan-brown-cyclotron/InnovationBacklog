# Solution Catalog — Repository Review

## Purpose
Specify how Momentum reads and analyses a submitted solution repository safely, without ever writing to it, so that the solution catalog is grounded in a faithful deep review.

## Purpose
Lock in the read-only contract for the repository reader and the agent's deep review.

## Reader Contract
- The repository reader (`IRepositoryReader`) operates only on the submitted solution repository.
- No tokens, contracts, or credentials used by the reader permit write operations against the submitted repository.
- The reader returns structured repository contents that the deep review agent consumes.

## Agent Contract
- `SolutionDeepReview` agent analyses the read-only repository content and produces the `AcceptanceTriageResult`.
- The agent never mutates repository state.
- The agent never persists the result to domain storage; the catalog publication application service validates and writes.

## Invariants
- Submitted repositories are read-only to Momentum and to agents at all times.
- The reader and the hub publisher use separate credentials and contracts.
- A repository read failure is recorded on the catalog item; the catalog item remains absent or pending rather than being marked published.

## Contracts
- Inputs: repository reference on the accepted solution submission.
- Outputs: structured repository content + structured `AcceptanceTriageResult`.
- Ports: `IRepositoryReader`.

## Related Design
- `docs/design/capabilities/solution-catalog/catalog-entry.md`
- `docs/design/platform/github/repository-reading.md`
- `docs/design/platform/github/credential-separation.md`

## Related Decisions
- `0003-submitted-repositories-are-read-only`
