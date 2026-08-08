# .NET Aspire — Platform Index

## Purpose
Define how Momentum is composed through .NET Aspire as the composition root, while keeping Momentum.Service as the application runtime, so that local development, deployment topology, and resource wiring are centralized in one place.

## Owned Responsibilities
- Aspire resource composition (storage, queues, database, applications).
- Local development topology.
- Service references and discovery.
- Configuration and secrets composition.
- OpenTelemetry, health checks, and service discovery wiring.
- Deployment topology composition.

## Explicit Non-Responsibilities
- Application workflow logic.
- Business decisions or rules.
- Agent execution boundaries (see `docs/design/cross-cutting/agent-execution`).
- Detailed Azure Functions or Foundry wiring (see `docs/design/cross-cutting/background-processing` and `azure-foundry`).

## Requirement Baseline
- (composition; supporting multiple requirements.)

## Current Architecture
*Scaffolded baseline — pending requirement acceptance and design review.*

`Momentum.AppHost` composes Azurite (Tables and Queues), `Momentum.Service`, `Momentum.Worker`, `Momentum.Frontend`, the GitHub MCP integration, Foundry configuration, OpenTelemetry, health checks, service discovery, and secrets/parameters. Aspire supplies references; `Momentum.Service` is the actual application runtime and `Momentum.Worker` is the agent execution runtime.

## Invariants
- The Aspire AppHost composes resources and services; it contains no business workflow.
- The Aspire AppHost makes no business decisions.
- Service discovery and configuration flow through Aspire-resolved references, not hardcoded endpoints.

## Contracts
- Out: Aspire references for Tables, Queues, Service, Worker, Frontend, Foundry, GitHub MCP.
- In: environment configuration and secrets.

## Related Design
- `docs/design/platform/azure-storage`
- `docs/design/cross-cutting/background-processing`
- `docs/design/platform/azure-foundry`
- `docs/design/platform/github`
- `docs/design/platform/mcp`
- `docs/design/platform/frontend`
- `src/Momentum.Worker/AGENTS.md`

## Related Decisions
- `0012-aspire-apphost-is-the-composition-root`
- `0013-azure-functions-replace-hangfire`

## Deeper Documents
- `docs/design/platform/aspire/composition.md`
- `docs/design/platform/aspire/local-development.md`
- `docs/design/platform/aspire/deployment-topology.md`
