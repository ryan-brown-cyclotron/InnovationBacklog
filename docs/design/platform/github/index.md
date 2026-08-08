# GitHub — Platform Index

## Purpose
Define Momentum's GitHub integration so that the read source (submitted repositories) and the write target (managed hub repository) remain strictly separated, and so that GitHub is treated as a one-way projection rather than a system of record.

## Owned Responsibilities
- Read-only access to submitted solution repositories.
- Write access to the managed Momentum hub repository for the catalog README.
- Separation of read and write credentials and contracts.
- Repository reader (`GitHubRepositoryReader`) implementation.
- Hub publisher (`HubRepositoryPublisher`) implementation.
- MCP client (`GitHubMcpClient`) where applicable.

## Explicit Non-Responsibilities
- Business rules (see domain and capability design).
- Application workflow (see `Momentum.Service/AGENTS.md`).
- Storage or queue mechanics (see platform design for Azure Storage and `docs/design/cross-cutting/background-processing`).

## Requirement Baseline
- `docs/requirements/solution-catalog.md`
- `docs/requirements/submission-governance.md`

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.Library.Infrastructure` provides `GitHubRepositoryReader`, `HubRepositoryPublisher`, and `GitHubMcpClient`. The repository reader uses a read-scope credential. The hub publisher uses a write-scope credential exclusive to the managed hub repository.

## Invariants
- Submitted repositories are always read-only to Momentum.
- The managed Momentum hub repository is the only GitHub target for catalog projection.
- A single broad GitHub credential is never created.
- Momentum does not modify any submitted repository through either path.

## Contracts
- In: read access to the submitted repository used for deep review.
- Out: idempotent, content-hash-gated commits to the managed hub repository for the catalog README.

## Related Design
- `docs/design/capabilities/solution-catalog/readme-projection.md`
- `docs/design/cross-cutting/agent-execution`
- `docs/design/platform/aspire/composition.md`

## Related Decisions
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0004-catalog-readme-is-a-derived-projection`

## Deeper Documents
- `docs/design/platform/github/repository-reading.md`
- `docs/design/platform/github/hub-publication.md`
- `docs/design/platform/github/credential-separation.md`
