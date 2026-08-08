# Momentum.Library.Runtime

Owns the agent, MCP, event, and job runtime. Implements `IAgentTriageRuntime` here, behind the Application port. Hosts the Microsoft Agent Framework and Foundry integration.

## Local Ownership

- Agents: `CreationTriageAgent`, `AcceptanceTriageAgent`.
- Backlog agents: `BacklogCreationTriage`, `BacklogPublicationFormatter`.
- Solution agents: `SolutionCreationReview`, `SolutionDeepReview`, `CatalogEntryFormatter`.
- Events: `DomainEventEnvelope` definitions consumed by asynchronous workers and published by `Infrastructure`.
- MCP: `CatalystToolRegistry`, `CatalystMcpServer`, `McpAuthorizationPolicy`.

## Constraints

- References only `Momentum.Library.Application`. Must not reference `Infrastructure`.
- Agents never write domain records directly. Every agent call returns a structured result validated by Application.
- Distinct GitHub read and write credentials must never be unified in this layer.
- Agent execution is triggered by asynchronous events. Duplicate queue delivery must not duplicate reviews, publications, or projections.

## Verification

Agent-boundary tests live in `tests/Momentum.Tests`. Structured agent results are asserted directly; applications of agent results are tested through Application ports.