# Azure Foundry — Agent Registration

## Purpose
Document how Momentum agents are registered against Foundry, including the boundary that keeps the domain free of Foundry dependencies.

## Purpose
Define the registration strategy and ownership boundaries.

## Registration
- Agent definitions live in `Momentum.Library.Runtime`.
- Foundry credentials, identities, and configuration live in `Momentum.Library.Infrastructure` and Aspire parameter wiring.
- Creation triage agents (`BacklogCreationTriage`, `SolutionCreationReview`) and acceptance triage agents (`BacklogPublicationFormatter`, `SolutionDeepReview`, `CatalogEntryFormatter`) are wired through `AgentFrameworkRegistration`.

## Invariants
- Agent registration does not import Foundry SDKs into `Momentum.Library.Domain`.
- Agent identities are distinct from business user identities.
- Agents run only against Forge session identities provisioned by Momentum — they cannot act outside their registered scope.
- Agents must not be granted GitHub write capability for submitted repositories.

## Contracts
- In: configuration values.
- Out: agent registration records.

## Related Design
- `docs/design/cross-cutting/agent-execution`
- `docs/design/platform/github/credential-separation.md`

## Related Decisions
- `0007-agents-return-structured-results`
