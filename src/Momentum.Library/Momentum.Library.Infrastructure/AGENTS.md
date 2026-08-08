# Momentum.Library.Infrastructure

Owns concrete adapters for Azure Storage, Foundry, GitHub, catalog projection, and business identity. Implementations of `Application` ports live here.

## Local Ownership

- Azure Storage: Table repositories, Azure Queue event publisher, outbox repository.
- Foundry: `FoundryAgentRuntime`, Agent Framework registration helpers.
- GitHub: read-only `GitHubRepositoryReader`, write-only `HubRepositoryPublisher`, `GitHubMcpClient`.
- Projection: `MarkdownCatalogRenderer`, `CatalogReadmePublisher`.
- Identity: `BusinessIdentityAdapter`.

## Constraints

- References `Application` and `Runtime`. Must not reference `Domain` directly.
- Submitted solution repositories are read-only. Only the managed Momentum hub repository accepts catalog projection writes.
- Read and write GitHub credentials must be separate contracts.
- Adapters implement Application ports. They must not redefine domain rules.

## Verification

Adapter conformance is verified through Application port tests in `tests/Momentum.Tests` using fake versions of external services. Repository write boundary and projection-safety tests live in the tests project.