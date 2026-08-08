# GitHub — Credential Separation

## Purpose
Codify the strict separation between the read-only credential used for submitted repositories and the write-only credential used for the managed hub repository so the read and write surfaces cannot be conflated.

## Purpose
Prevent a single broad GitHub credential from ever being created or used; protect the submitted-repository boundary.

## Mandatory Separation
- **Read-only submitted repository credential** — used by `GitHubRepositoryReader` for reading submitted solution repositories. Read scope only. Has no write authority to any submitted repository, and is not authorized to push or commit anywhere.
- **Write-only hub repository credential** — used by `HubRepositoryPublisher` for committing the catalog README to the managed Momentum hub repository. Write scope only, narrowly scoped to the hub repository and to the README file. Has no read authority over submitted repositories.

## Boundaries
- A submitted repository is **read-only**.
- The managed Momentum hub repository is the **only** repository that may receive catalog projection writes.
- Read and write contracts are separate code paths and configuration sections in `Momentum.Library.Infrastructure`.
- Momentum will never merge the two credentials into a single token, app installation, or contract.

## Invariants
- The reader cannot gain write authority, even through reuse, escalation, or token expiration.
- The hub publisher cannot read submitted repositories through its credential.
- No agent receives either credential with broader scope than its dedicated surface.

## Contracts
- In: scoped credentials supplied through Aspire parameter wiring.
- Out: dedicated contracts returning read-only data and write-projection outcomes.

## Related Design
- `docs/design/platform/github/repository-reading.md`
- `docs/design/platform/github/hub-publication.md`
- `docs/design/cross-cutting/agent-execution`

## Related Decisions
- `0002-github-synchronization-is-one-way`
- `0003-submitted-repositories-are-read-only`
- `0004-catalog-readme-is-a-derived-projection`
