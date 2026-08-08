# Aspire — Deployment Topology

## Purpose
Describe how the composition generalizes from local development to deployment, so production topology aligns with the same resource graph.

## Purpose
Make production topology a direct extension of local development rather than a separate design.

## Topology
- Azure Storage accounts replace Azurite for Tables and Queues in production.
- `Momentum.Worker` becomes an Azure Functions application resource using Aspire's resource mapping.
- `Momentum.Service` and `Momentum.Frontend` become application resources in AppHost.
- Foundry is the production project with the model deployment and agent identities configured.
- GitHub MCP is the production GitHub integration.
- OpenTelemetry exports to the production observability backend.

## Invariants
- The deployment topology is the same resource graph as local development; only the concrete resources differ.
- No business workflow lives in the AppHost at any stage.
- Hard-coded production credentials do not exist; configuration passes through AppHost parameter wiring.

## Contracts
- Production telemetry flows through the same OpenTelemetry configuration as local.
- Health endpoints are still consumed by AppHost for resource health.

## Related Design
- `docs/design/platform/aspire/composition.md`
- `docs/design/platform/azure-storage`
- `docs/design/cross-cutting/background-processing`

## Related Decisions
- `0012-aspire-apphost-is-the-composition-root`
